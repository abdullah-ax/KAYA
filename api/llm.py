"""Model adapters. Every reply is JSON checked against a Pydantic schema."""
from __future__ import annotations

import json
import re
import time
from urllib.parse import urlparse
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Callable, Protocol

import httpx
from pydantic import BaseModel, SecretStr, ValidationError

if TYPE_CHECKING:
    from api.config import Config


_LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


class LLMError(Exception):
    """The model gave no valid reply after all retries."""


@dataclass
class Usage:
    prompt_tokens: int
    completion_tokens: int


class LLM(Protocol):
    name: str

    def complete(self, system: str, user: str, schema: type[BaseModel]) -> tuple[BaseModel, Usage]: ...


Reply = dict[str, Any]


class FakeLLM:
    """Test double: hands back canned replies in order, or calls a function."""

    name = "fake"

    def __init__(self, replies: list[Reply] | Callable[[str, str, type[BaseModel]], Reply]) -> None:
        self._replies = replies if callable(replies) else list(replies)
        self.calls: list[tuple[str, str]] = []

    def complete(self, system: str, user: str, schema: type[BaseModel]) -> tuple[BaseModel, Usage]:
        self.calls.append((system, user))
        if callable(self._replies):
            reply = self._replies(system, user, schema)
        elif self._replies:
            reply = self._replies.pop(0)
        else:
            raise LLMError("FakeLLM ran out of replies.")
        try:
            parsed = schema.model_validate(reply)
        except ValidationError as exc:
            raise LLMError(f"Fake reply does not match {schema.__name__}: {exc}") from exc
        return parsed, Usage(len(system.split()) + len(user.split()), len(str(reply).split()))


def _sleep(seconds: float) -> None:  # patched in tests
    time.sleep(seconds)


_THINK = re.compile(r"<think>.*?</think>", re.S | re.I)
_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.S | re.I)
_NO_RETRY = {400, 401, 403, 404, 422}


def clean_reply(content: str) -> str:
    """Drop reasoning text and code fences that thinking models wrap around their JSON."""
    content = _THINK.sub("", content or "").strip()
    fenced = _FENCE.match(content)
    return fenced.group(1) if fenced else content


def _wait_for(exc: httpx.HTTPStatusError, attempt: int) -> float:
    after = exc.response.headers.get("Retry-After", "")
    if after.isdigit():
        return min(float(after), 20.0)
    return min(0.5 * 2 ** attempt, 8.0)


class _HTTPLLM:
    """Shared retry loop with backoff. Schema misses are fed back; rejected requests are not retried."""

    def __init__(self, model: str, temperature: float, max_retries: int,
                 client: httpx.Client | None) -> None:
        self.name = model
        self._temperature = temperature
        self._max_retries = max_retries
        self._client = client or httpx.Client(timeout=httpx.Timeout(90.0, connect=5.0))

    def complete(self, system: str, user: str, schema: type[BaseModel]) -> tuple[BaseModel, Usage]:
        last: Exception | None = None
        prompt = user
        for attempt in range(self._max_retries + 1):
            try:
                content, usage = self._call(system, prompt, schema)
                return schema.model_validate_json(clean_reply(content)), usage
            except httpx.HTTPStatusError as exc:
                last = exc
                if exc.response.status_code in _NO_RETRY:
                    break
                if attempt < self._max_retries:
                    _sleep(_wait_for(exc, attempt))
            except httpx.TransportError as exc:
                last = exc
                if attempt < self._max_retries:
                    _sleep(min(0.5 * 2 ** attempt, 8.0))
            except ValidationError as exc:
                last = exc
                fields = sorted({".".join(str(p) for p in e["loc"]) for e in exc.errors()})
                prompt = (f"{user}\n\nYour last reply did not match the schema. Fix these fields: "
                          f"{', '.join(fields) or 'the JSON format'}. Reply with JSON only.")
            except (ValueError, KeyError, TypeError) as exc:
                last = exc
        raise LLMError(
            f"{self.name} gave no valid {schema.__name__} after {attempt + 1} tries: {type(last).__name__}"
        ) from last

    def _call(self, system: str, user: str, schema: type[BaseModel]) -> tuple[str, Usage]:
        raise NotImplementedError


class OllamaLLM(_HTTPLLM):
    """Local open-weight model through Ollama's /api/chat."""

    def __init__(self, base_url: str, model: str, temperature: float = 0, max_retries: int = 3,
                 client: httpx.Client | None = None) -> None:
        super().__init__(model, temperature, max_retries, client)
        self._url = base_url.rstrip("/") + "/api/chat"

    def _call(self, system: str, user: str, schema: type[BaseModel]) -> tuple[str, Usage]:
        resp = self._client.post(self._url, json={
            "model": self.name,
            "stream": False,
            "format": schema.model_json_schema(),
            "options": {"temperature": self._temperature},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        })
        resp.raise_for_status()
        data = resp.json()
        usage = Usage(int(data.get("prompt_eval_count", 0)), int(data.get("eval_count", 0)))
        return data["message"]["content"], usage


class OpenAICompatLLM(_HTTPLLM):
    """Any OpenAI-style /chat/completions API (Groq, OpenRouter free tiers). Founder brings the key."""

    def __init__(self, base_url: str, api_key: str, model: str, temperature: float = 0,
                 max_retries: int = 3, client: httpx.Client | None = None) -> None:
        super().__init__(model, temperature, max_retries, client)
        self._url = base_url.rstrip("/") + "/chat/completions"
        self._key = SecretStr(api_key)  # masked in repr and logs

    def _call(self, system: str, user: str, schema: type[BaseModel]) -> tuple[str, Usage]:
        schema_note = "Reply with one JSON object that matches this JSON schema:\n" + json.dumps(
            schema.model_json_schema()
        )
        resp = self._client.post(
            self._url,
            headers={"Authorization": f"Bearer {self._key.get_secret_value()}"},
            json={
                "model": self.name,
                "temperature": self._temperature,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "system", "content": schema_note},
                    {"role": "user", "content": user},
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()
        raw = data.get("usage") or {}
        usage = Usage(int(raw.get("prompt_tokens", 0)), int(raw.get("completion_tokens", 0)))
        return data["choices"][0]["message"]["content"], usage


class FallbackLLM:
    """Try the main local model; if it is down or missing, use the configured fallback model."""

    def __init__(self, primary: _HTTPLLM, fallback: _HTTPLLM | None) -> None:
        self._primary, self._fallback = primary, fallback
        self.name = primary.name

    def complete(self, system: str, user: str, schema: type[BaseModel]) -> tuple[BaseModel, Usage]:
        try:
            out = self._primary.complete(system, user, schema)
            self.name = self._primary.name
            return out
        except LLMError as err:
            transport = isinstance(err.__cause__, (httpx.TransportError, httpx.HTTPStatusError))
            if self._fallback is None or not transport:
                raise
            out = self._fallback.complete(system, user, schema)
            self.name = self._fallback.name
            return out


def make_llm(cfg: Config, provider: str = "ollama", api_key: str | None = None,
             base_url: str | None = None, model: str | None = None) -> LLM:
    """Build the adapter the founder picked. Default is the local Ollama model."""
    if provider == "ollama":
        url, name = base_url or cfg.model.ollama_url, model or cfg.model.default
        main = OllamaLLM(url, name, cfg.model.temperature, cfg.model.max_retries)
        backup = cfg.model.fallback if model is None and cfg.model.fallback != name else None
        spare = OllamaLLM(url, backup, cfg.model.temperature, cfg.model.max_retries) if backup else None
        return FallbackLLM(main, spare)
    if provider == "openai":
        if not api_key or not base_url:
            raise ValueError("The openai provider needs an API key and a base URL.")
        parts = urlparse(base_url)
        if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS):
            raise ValueError("The base URL must start with https:// (http:// only for localhost).")
        return OpenAICompatLLM(base_url, api_key, model or cfg.model.default,
                               cfg.model.temperature, cfg.model.max_retries)
    raise ValueError(f"Unknown provider: {provider}")
