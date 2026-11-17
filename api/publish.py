"""Put the approved sign-up page online with the founder's own free Netlify account.

The token is used for one request and never stored, logged or echoed. This module
does not check the founder's approval: the endpoints in api/app.py do that first.
"""
from __future__ import annotations

import html
import io
import re
import zipfile
from dataclasses import dataclass

import httpx

NETLIFY_API = "https://api.netlify.com/api/v1"
TIMEOUT = 30


class DeliveryError(Exception):
    """A plain-words problem the founder can act on. `status` is the HTTP code the API answers with."""

    def __init__(self, message: str, status: int = 502) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Deployed:
    site_id: str
    url: str


def render_index(markdown: str) -> str:
    """A minimal accessible page from the approved markdown. No scripts, no tracking, nothing external."""
    title = "Sign up"
    body: list[str] = []
    for block in re.split(r"\n\s*\n", markdown.strip()):
        block = block.strip()
        if not block or block.startswith("STUBBED:"):
            continue  # the saved-locally note is for the founder, not for visitors
        if block.startswith("# "):
            title = block[2:].strip().splitlines()[0]
            body.append(f"<h1>{html.escape(title)}</h1>")
        elif block.startswith("## "):
            body.append(f"<h2>{html.escape(block[3:].strip())}</h2>")
        elif all(line.lstrip().startswith(("- ", "* ")) for line in block.splitlines()):
            items = "".join(f"<li>{html.escape(line.lstrip()[2:])}</li>" for line in block.splitlines())
            body.append(f"<ul>{items}</ul>")
        else:
            body.append("<p>" + "<br>\n".join(html.escape(line) for line in block.splitlines()) + "</p>")
    note = ("<p><strong>STUBBED:</strong> the sign-up form is not connected yet, so an email left here "
            "is not collected. The page owner will add a real way to sign up.</p>")
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
            f"<title>{html.escape(title)}</title>\n"
            "<style>body{font:18px/1.6 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;"
            "color:#111;background:#fff}h1{line-height:1.2}a{color:#0645ad}</style>\n</head>\n"
            f"<body>\n<main>\n" + "\n".join(body) + f"\n{note}\n</main>\n</body>\n</html>\n")


def _site_name(run_id: str) -> str:
    return "boardroom-" + re.sub(r"[^a-z0-9]", "", run_id.lower())[:30]


def _zip_index(markdown: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("index.html", render_index(markdown))
    return buffer.getvalue()


class NetlifyPublisher:
    """Create a site, deploy one page, take it down. Talks only to api.netlify.com."""

    def __init__(self, token: str, client: httpx.Client | None = None) -> None:
        self._token = token.strip()
        self._client = client

    def _send(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self._token}", **(kwargs.pop("headers", None) or {})}  # type: ignore[arg-type]
        try:
            if self._client is not None:
                return self._client.request(method, f"{NETLIFY_API}{path}", headers=headers, **kwargs)  # type: ignore[arg-type]
            return httpx.request(method, f"{NETLIFY_API}{path}", headers=headers, timeout=TIMEOUT, **kwargs)  # type: ignore[arg-type]
        except httpx.HTTPError:
            raise DeliveryError("We could not reach Netlify. Check your internet and try again.") from None

    @staticmethod
    def _check(resp: httpx.Response, what: str) -> None:
        if resp.status_code in (401, 403):
            raise DeliveryError("Netlify did not accept that token. Make a new one and paste all of it.", 422)
        if resp.status_code == 429:
            raise DeliveryError("Netlify says too many requests. Wait a minute and try again.")
        if resp.status_code >= 400:
            raise DeliveryError(f"Netlify could not {what} (error {resp.status_code}). Try again in a minute.")

    def deploy(self, run_id: str, page_markdown: str) -> Deployed:
        resp = self._send("POST", "/sites", json={"name": _site_name(run_id)})
        self._check(resp, "create your site")
        site = resp.json()
        site_id = str(site["id"])
        try:
            deploy = self._send("POST", f"/sites/{site_id}/deploys", content=_zip_index(page_markdown),
                                headers={"Content-Type": "application/zip"})
            self._check(deploy, "publish your page")
        except DeliveryError:
            try:
                self.take_down(site_id)  # do not leave an empty site behind
            except DeliveryError:
                pass
            raise
        url = str(site.get("ssl_url") or f"https://{site.get('name') or _site_name(run_id)}.netlify.app")
        return Deployed(site_id, url if url.startswith("https://") else "https://" + url.split("://")[-1])

    def take_down(self, site_id: str) -> None:
        resp = self._send("DELETE", f"/sites/{site_id}")
        if resp.status_code == 404:
            return  # already gone
        self._check(resp, "take your page down")
