"""A URL with no host (seen in a real run) must never become a card or an allowed source."""
import httpx

from api.research import SearchResult, SearxSearch, SourceRegistry, claim_sources

HOSTLESS = "http:///go/v1/AeFR77"


def test_search_drops_results_whose_url_has_no_host(monkeypatch):
    body = {"results": [{"title": "Bad", "url": HOSTLESS, "content": "x", "engine": "g"},
                        {"title": "Odd", "url": "not a url", "content": "x", "engine": "g"},
                        {"title": "Good", "url": "https://example.com/a", "content": "x", "engine": "g"}]}
    monkeypatch.setattr(httpx, "get", lambda *a, **k: httpx.Response(
        200, json=body, request=httpx.Request("GET", "http://x")))

    urls = [r.url for r in SearxSearch("http://searx").search("q")]

    assert urls == ["https://example.com/a"]


def test_registry_never_records_or_cites_a_url_with_no_host():
    reg = SourceRegistry()
    reg.record([SearchResult("Bad", HOSTLESS, "x", None)])

    assert not reg.allows(HOSTLESS)
    claim, cards = claim_sources("A claim.", [HOSTLESS], reg)
    assert cards == [] and claim.startswith("ASSUMPTION: ")
