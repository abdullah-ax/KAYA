"""Research tools: SearXNG client, trust rules, per-run source allowlist."""
import json

import httpx
import respx

import pytest

from api.research import (
    FakeSearch,
    SearchResult,
    SearxSearch,
    SourceRegistry,
    claim_sources,
    label_claim,
    trust_for,
    write_sources,
)

SEARX = "http://searx.test"


@respx.mock
def test_searx_search_parses_json_results():
    route = respx.get(f"{SEARX}/search").mock(
        return_value=httpx.Response(200, json={"results": [
            {"title": "Census data", "url": "https://www.census.gov/x", "content": "Numbers.", "engine": "bing"},
            {"title": "Thread", "url": "https://www.reddit.com/r/a", "content": "Talk.", "engine": "google"},
        ]})
    )
    results = SearxSearch(SEARX).search("freelance invoicing pain", n=8)
    assert route.called
    params = route.calls.last.request.url.params
    assert params["format"] == "json" and params["q"] == "freelance invoicing pain"
    assert results[0] == SearchResult("Census data", "https://www.census.gov/x", "Numbers.", "bing")
    assert len(results) == 2


@respx.mock
def test_searx_search_failure_returns_empty_list():
    respx.get(f"{SEARX}/search").mock(side_effect=httpx.ConnectError("down"))
    assert SearxSearch(SEARX).search("anything") == []
    respx.get(f"{SEARX}/search").mock(return_value=httpx.Response(429, text="limited"))
    assert SearxSearch(SEARX).search("anything") == []


@pytest.mark.parametrize("url,trust", [
    ("https://www.reddit.com/r/freelance/comments/abc", "low"),
    ("https://old.reddit.com/r/x", "low"),
    ("https://news.ycombinator.com/item?id=1", "low"),
    ("https://twitter.com/someone/status/1", "low"),
    ("https://www.bls.gov/ooh/", "high"),
    ("https://www.ons.gov.uk/data", "high"),
    ("https://cs.stanford.edu/paper", "high"),
    ("https://ec.europa.eu/eurostat/x", "high"),
    ("https://www.reuters.com/tech/a", "high"),
    ("https://blog.stripe.com/post", "medium"),
    ("https://acme.com/blog/why-acme", "medium"),
    ("https://somerandomsite.io/page", "medium"),
])
def test_trust_for_rules(url, trust):
    assert trust_for(url) == trust


SEEN = SearchResult("Freelancer survey", "https://www.bls.gov/survey", "41% invoice late.", "bing")


def _registry() -> SourceRegistry:
    reg = SourceRegistry()
    reg.record(FakeSearch({"late invoices": [SEEN]}).search("late invoices"))
    return reg


def test_seen_url_backs_claim_and_unseen_url_becomes_assumption():
    reg = _registry()
    text, card = label_claim("41% of freelancers get paid late.", SEEN.url, reg)
    assert text == "41% of freelancers get paid late."
    assert card is not None and card.url == SEEN.url and card.trust == "high"
    assert card.backs == "41% of freelancers get paid late."

    text, card = label_claim("Most freelancers hate invoicing.", "https://made-up.example/stats", reg)
    assert text == "ASSUMPTION: Most freelancers hate invoicing."
    assert card is None
    assert not reg.allows("https://made-up.example/stats")


def test_claim_sources_drops_unseen_urls_and_keeps_seen():
    reg = _registry()
    text, cards = claim_sources("Late pay is common.", [SEEN.url, "https://invented.example"], reg)
    assert text == "Late pay is common."
    assert [c.url for c in cards] == [SEEN.url]

    text, cards = claim_sources("Late pay is common.", ["https://invented.example"], reg)
    assert text.startswith("ASSUMPTION: ") and cards == []


@respx.mock
def test_search_failure_means_caller_labels_claim_assumption():
    respx.get(f"{SEARX}/search").mock(return_value=httpx.Response(500))
    reg = SourceRegistry()
    reg.record(SearxSearch(SEARX).search("late invoices"))
    text, cards = claim_sources("Late pay is common.", [SEEN.url], reg)
    assert text == "ASSUMPTION: Late pay is common." and cards == []


def test_reddit_source_card_is_low_trust_opinion():
    reg = SourceRegistry()
    reg.record([SearchResult("Rant", "https://www.reddit.com/r/freelance/1", "ugh", None)])
    _, card = label_claim("Some freelancers chase invoices weekly.", "https://www.reddit.com/r/freelance/1", reg)
    assert card is not None and card.trust == "low" and card.type == "opinion"


def test_write_sources_json_uses_source_card_template_fields(tmp_run):
    reg = _registry()
    _, card = label_claim("41% of freelancers get paid late.", SEEN.url, reg)
    path = write_sources(tmp_run / "outputs" / "phase1_step2_sources.json", [card])
    data = json.loads(path.read_text(encoding="utf-8"))
    assert path.name == "phase1_step2_sources.json"
    entry = data[0]
    assert entry["id"] == "S1" and entry["url"] == SEEN.url and entry["trust"] == "high"
    assert entry["type"] == "primary" and entry["trust_reason"]
    assert entry["claims_backed"] == ["41% of freelancers get paid late."]
    assert entry["step"] == "phase1_step2"
    assert {"title", "publisher", "date_published", "date_accessed"} <= entry.keys()


def test_write_sources_merges_claims_for_the_same_source(tmp_run):
    reg = _registry()
    cards = [label_claim(c, SEEN.url, reg)[1] for c in ("Claim one.", "Claim two.")]
    data = json.loads(write_sources(tmp_run / "phase1_step2_sources.json", cards).read_text())
    assert len(data) == 1 and data[0]["claims_backed"] == ["Claim one.", "Claim two."]


def test_searxng_settings_enable_json_and_compose_mounts_them():
    import yaml
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    settings = yaml.safe_load((root / "searxng" / "settings.yml").read_text())
    assert settings["use_default_settings"] is True
    assert "json" in settings["search"]["formats"]
    assert settings["server"]["limiter"] is False
    service = yaml.safe_load((root / "docker-compose.yml").read_text())["services"]["searxng"]
    assert any(v.startswith("./searxng") and v.split(":")[1] == "/etc/searxng" for v in service["volumes"])
    assert any("SEARXNG_SECRET" in e for e in service["environment"])
