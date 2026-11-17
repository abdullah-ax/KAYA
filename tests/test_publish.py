"""Put the approved sign-up page online with the founder's own Netlify token. Netlify is faked with respx."""
import io
import json
import zipfile

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

import pipeline_fakes as fx
from api.app import create_app
from api.publish import DeliveryError, NetlifyPublisher, render_index
from test_app import answer, decide, next_stage, to_phase1_gate, REASON1

TOKEN = "nfp_SECRETTOKEN1234567890"
API = "https://api.netlify.com/api/v1"
SITE = {"id": "site-123", "name": "boardroom-x", "ssl_url": "https://boardroom-x.netlify.app"}
PAGE = ("# Speak IELTS with confidence\n\nShort drills.\n\nFor: IELTS students <b>in</b> Alexandria\n\n"
        "Leave your email to hear when it is ready.\n\n"
        "STUBBED: approved by the founder, saved here only. Nothing was posted online.\n")


@pytest.fixture
def client(tmp_run):
    app = create_app(llm_factory=lambda cfg, p, k: fx.scripted_llm(fx.strong_opportunities()),
                     search_factory=lambda cfg: fx.fake_search())
    with TestClient(app) as c:
        yield c


def to_publish_gate(client):
    run_id, _ = to_phase1_gate(client)
    decide(client, run_id, "Speaking drills", REASON1)
    next_stage(client, run_id)
    state = answer(client, run_id, "I coached 300 students and scored band 8.5")
    assert state["pending"]["key"] == "publish"
    return run_id


def approved_run(client):
    run_id = to_publish_gate(client)
    decide(client, run_id, "Publish the sign-up page", REASON1)
    return run_id


def netlify_ok(router):
    create = router.post(f"{API}/sites").mock(return_value=httpx.Response(201, json=SITE))
    deploy = router.post(f"{API}/sites/site-123/deploys").mock(
        return_value=httpx.Response(200, json={"id": "d1", "ssl_url": SITE["ssl_url"]}))
    return create, deploy


# -- the page and the publisher ---------------------------------------------------
def test_index_html_uses_the_pages_words_escapes_html_and_loads_nothing_external():
    html = render_index(PAGE)

    assert "<h1>Speak IELTS with confidence</h1>" in html
    assert "Short drills." in html and "&lt;b&gt;in&lt;/b&gt;" in html and "<b>" not in html
    assert 'lang="en"' in html and "<title>Speak IELTS with confidence</title>" in html
    assert "<script" not in html and "http://" not in html and "https://" not in html
    assert "Nothing was posted online" not in html
    assert "STUBBED" in html  # no form backend: the page says so


def test_publisher_creates_a_site_then_deploys_a_zip_with_index_html():
    with respx.mock(assert_all_called=True) as router:
        create, deploy = netlify_ok(router)

        result = NetlifyPublisher(TOKEN).deploy("abc123def456", PAGE)

    assert result.site_id == "site-123" and result.url == "https://boardroom-x.netlify.app"
    assert json.loads(create.calls[0].request.content) == {"name": "boardroom-abc123def456"}
    req = deploy.calls[0].request
    assert req.headers["content-type"] == "application/zip"
    assert req.headers["authorization"] == f"Bearer {TOKEN}"
    assert zipfile.ZipFile(io.BytesIO(req.content)).namelist() == ["index.html"]


def test_publisher_deletes_the_site_it_just_made_if_the_deploy_fails():
    with respx.mock() as router:
        router.post(f"{API}/sites").mock(return_value=httpx.Response(201, json=SITE))
        router.post(f"{API}/sites/site-123/deploys").mock(return_value=httpx.Response(500))
        gone = router.delete(f"{API}/sites/site-123").mock(return_value=httpx.Response(204))

        with pytest.raises(DeliveryError):
            NetlifyPublisher(TOKEN).deploy("abc123def456", PAGE)

    assert gone.called


def test_take_down_deletes_the_site():
    with respx.mock() as router:
        gone = router.delete(f"{API}/sites/site-123").mock(return_value=httpx.Response(204))
        NetlifyPublisher(TOKEN).take_down("site-123")
    assert gone.calls[0].request.headers["authorization"] == f"Bearer {TOKEN}"


def test_network_failure_is_a_plain_message_without_the_token():
    with respx.mock() as router:
        router.post(f"{API}/sites").mock(side_effect=httpx.ConnectError(f"boom {TOKEN}"))
        with pytest.raises(DeliveryError) as err:
            NetlifyPublisher(TOKEN).deploy("abc123def456", PAGE)
    assert "reach Netlify" in str(err.value) and TOKEN not in str(err.value)


# -- the endpoints ----------------------------------------------------------------
def post(client, run_id, token=TOKEN):
    return client.post(f"/runs/{run_id}/publish/netlify", headers={"X-Netlify-Token": token} if token else {})


def test_publish_is_refused_before_the_founder_approves(client):
    run_id = to_publish_gate(client)
    with respx.mock(assert_all_mocked=True) as router:
        resp = post(client, run_id)
        assert not router.calls
    assert resp.status_code == 409
    assert "approve" in resp.json()["detail"].lower()


def test_publish_is_refused_if_the_founder_kept_the_page_private(client):
    run_id = to_publish_gate(client)
    decide(client, run_id, "Keep it private", REASON1)
    with respx.mock(assert_all_mocked=True) as router:
        resp = post(client, run_id)
        assert not router.calls
    assert resp.status_code == 409


def test_publish_to_unknown_run_is_404(client):
    assert post(client, "nope").status_code == 404


def test_missing_token_is_422_with_a_plain_message(client):
    run_id = approved_run(client)
    resp = post(client, run_id, token=None)
    assert resp.status_code == 422
    assert "token" in resp.json()["detail"].lower()


def test_token_in_the_body_or_query_is_not_accepted(client):
    run_id = approved_run(client)
    resp = client.post(f"/runs/{run_id}/publish/netlify?token={TOKEN}", json={"token": TOKEN})
    assert resp.status_code == 422


def test_publish_after_approval_deploys_logs_and_keeps_the_token_out_of_everything(client, tmp_run):
    run_id = approved_run(client)
    with respx.mock() as router:
        netlify_ok(router)
        resp = post(client, run_id)

    assert resp.status_code == 200, resp.text
    assert resp.json()["url"] == SITE["ssl_url"] and resp.json()["site_id"] == "site-123"
    log = client.get(f"/runs/{run_id}/log").json()
    entry = [e for e in log if e["action"] == "deploy_netlify"][-1]
    assert entry["agent"] == "delivery" and entry["sources"] == [SITE["ssl_url"]]
    assert entry["approved_by"] == "founder" and entry["founder_input"] == REASON1
    state = client.get(f"/runs/{run_id}").json()
    assert state["delivery"] == {"approved": True, "url": SITE["ssl_url"], "site_id": "site-123"}
    everything = resp.text + json.dumps(log) + json.dumps(state)
    for path in (tmp_run / run_id).rglob("*"):
        if path.is_file():
            everything += path.read_text(encoding="utf-8", errors="ignore")
    assert TOKEN not in everything


def test_state_says_approved_only_after_the_founder_approves(client):
    run_id = to_publish_gate(client)
    assert client.get(f"/runs/{run_id}").json()["delivery"]["approved"] is False
    decide(client, run_id, "Publish the sign-up page", REASON1)
    assert client.get(f"/runs/{run_id}").json()["delivery"] == {"approved": True, "url": None, "site_id": None}


def test_netlify_401_is_a_plain_422_and_the_token_is_never_echoed(client):
    run_id = approved_run(client)
    with respx.mock() as router:
        router.post(f"{API}/sites").mock(return_value=httpx.Response(401, json={"message": f"bad {TOKEN}"}))
        resp = post(client, run_id)

    assert resp.status_code == 422
    assert "Netlify did not accept that token" in resp.json()["detail"]
    assert TOKEN not in resp.text
    assert client.get(f"/runs/{run_id}").json()["delivery"]["url"] is None
    assert TOKEN not in json.dumps(client.get(f"/runs/{run_id}/log").json())


def test_a_second_publish_while_online_is_409(client):
    run_id = approved_run(client)
    with respx.mock() as router:
        netlify_ok(router)
        assert post(client, run_id).status_code == 200
        assert post(client, run_id).status_code == 409


def test_take_down_deletes_logs_and_clears_the_site(client):
    run_id = approved_run(client)
    with respx.mock() as router:
        netlify_ok(router)
        post(client, run_id)
        gone = router.delete(f"{API}/sites/site-123").mock(return_value=httpx.Response(204))
        resp = client.delete(f"/runs/{run_id}/publish/netlify", headers={"X-Netlify-Token": TOKEN})

    assert resp.status_code == 200 and gone.called
    log = client.get(f"/runs/{run_id}/log").json()
    entry = [e for e in log if e["action"] == "take_down_netlify"][-1]
    assert entry["agent"] == "delivery" and entry["approved_by"] == "founder" and entry["founder_input"] == REASON1
    assert entry["sources"] == [SITE["ssl_url"]]
    assert client.get(f"/runs/{run_id}").json()["delivery"]["url"] is None
    assert TOKEN not in resp.text + json.dumps(log)


def test_take_down_without_a_live_page_is_409(client):
    run_id = approved_run(client)
    assert client.delete(f"/runs/{run_id}/publish/netlify", headers={"X-Netlify-Token": TOKEN}).status_code == 409


def test_take_down_without_a_token_is_422_and_the_page_stays_online(client):
    run_id = approved_run(client)
    with respx.mock() as router:
        netlify_ok(router)
        post(client, run_id)
        assert client.delete(f"/runs/{run_id}/publish/netlify").status_code == 422
    assert client.get(f"/runs/{run_id}").json()["delivery"]["url"] == SITE["ssl_url"]
