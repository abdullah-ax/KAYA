"""Model adapters. Every reply is JSON checked against a Pydantic schema."""
from __future__ import annotations

import json
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


class _HTTPLLM:
    """Shared retry loop: bad JSON, schema errors and HTTP errors all retry."""

    def __init__(self, model: str, temperature: float, max_retries: int,
                 client: httpx.Client | None) -> None:
        self.name = model
        self._temperature = temperature
        self._max_retries = max_retries
        self._client = client or httpx.Client(timeout=120)

    def complete(self, system: str, user: str, schema: type[BaseModel]) -> tuple[BaseModel, Usage]:
        last: Exception | None = None
        for _ in range(self._max_retries + 1):
            try:
                content, usage = self._call(system, user, schema)
                return schema.model_validate_json(content), usage
            except (httpx.HTTPError, ValidationError, ValueError, KeyError, TypeError) as exc:
                last = exc
        raise LLMError(
            f"{self.name} gave no valid {schema.__name__} after {self._max_retries + 1} tries: "
            f"{type(last).__name__}"
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


def make_llm(cfg: Config, provider: str = "ollama", api_key: str | None = None,
             base_url: str | None = None, model: str | None = None) -> LLM:
    """Build the adapter the founder picked. Default is the local Ollama model."""
    if provider == "ollama":
        return OllamaLLM(base_url or cfg.model.ollama_url, model or cfg.model.default,
                         cfg.model.temperature, cfg.model.max_retries)
    if provider == "openai":
        if not api_key or not base_url:
            raise ValueError("The openai provider needs an API key and a base URL.")
        parts = urlparse(base_url)
        if parts.scheme != "https" and not (parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS):
            raise ValueError("The base URL must start with https:// (http:// only for localhost).")
        return OpenAICompatLLM(base_url, api_key, model or cfg.model.default,
                               cfg.model.temperature, cfg.model.max_retries)
    raise ValueError(f"Unknown provider: {provider}")
