"""Web API: the same pipeline as the CLI, one founder step at a time.

Each run's pipeline works in a background thread. When it needs the founder it
waits, and the web UI reads the pending question or gate with GET /runs/{id}.
There is no endpoint that publishes or passes a gate: a choice goes through
check_approval here, and again inside the pipeline before anything runs.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from api.approval import ApprovalError, check_approval
from api.config import Config, load_config
from api.publish import DeliveryError, NetlifyPublisher
from api.guardrail import check_answer
from api.llm import LLM, LLMError, make_llm
from api.log import DecisionLog
from api.onboarding import AnswerIn, next_step
from api import program
from api.plan import build_plan, get_version, plan_markdown
from api.orchestrator import NEXT_STAGE, AnswersExhausted, Ctx, run_pipeline
from api.research import Search, SearxSearch

ROOT = Path(__file__).resolve().parent.parent
LLMFactory = Callable[[Config, str, "str | None"], LLM]
SearchFactory = Callable[[Config], Search]
MAX_BODY_BYTES = 64 * 1024
MAX_SESSIONS = 50


def _default_llm(cfg: Config, provider: str, api_key: str | None) -> LLM:
    # The key lives only in this adapter's memory. It is never written to disk.
    if provider != "openai":
        return make_llm(cfg, provider)
    return make_llm(cfg, provider, api_key=api_key, base_url=os.environ.get("OPENAI_BASE_URL"),
                    model=os.environ.get("OPENAI_MODEL"))


def _scrub(text: str, secret: str | None) -> str:
    return text.replace(secret, "[hidden]") if secret else text


class NewRun(BaseModel):
    brief: str = Field(min_length=1, max_length=8000)
    mode: Literal["demo", "full"] = "demo"
    provider: Literal["ollama", "openai"] = "ollama"
    model: str | None = Field(default=None, max_length=100)


class NextQuestion(BaseModel):
    answers: list[AnswerIn] = Field(max_length=30)
    mode: Literal["demo", "full"] = "demo"
    provider: Literal["ollama", "openai"] = "ollama"
    model: str | None = Field(default=None, max_length=100)


class Answer(BaseModel):
    text: str = Field(max_length=4000)


class Choice(BaseModel):
    option: str = Field(max_length=200)
    reason: str = Field(max_length=2000)


class ModelTest(BaseModel):
    provider: Literal["ollama", "openai"] = "ollama"
    model: str | None = Field(default=None, max_length=100)


def with_model(cfg: Config, model: str | None) -> Config:
    """Per-run config with the founder's model pick. Only listed models are allowed."""
    if model is None:
        return cfg
    if model not in cfg.model.choices:
        raise HTTPException(422, f"Pick one of: {', '.join(cfg.model.choices)}.")
    return cfg.model_copy(update={"model": cfg.model.model_copy(update={"default": model})})


class _Ping(BaseModel):
    ok: bool


class WebAnswers:
    """An AnswerSource that waits for the founder to answer through the API."""

    level_up = True  # the run pauses between stages so the founder can chat, then moves on

    def __init__(self, on_change: Callable[[], None]) -> None:
        self.cv = threading.Condition()
        self.pending: tuple[str, str] | None = None
        self.pending_choice: dict[str, Any] | None = None  # structured question and options of a gate
        self.inbox: list[str] = []
        self.closed = False
        self._on_change = on_change

    def ask(self, key: str, prompt: str, choice: dict[str, Any] | None = None) -> str:
        with self.cv:
            self.pending = (key, prompt)
            self.pending_choice = choice
            self.cv.notify_all()
            self._on_change()
            self.cv.wait_for(lambda: bool(self.inbox) or self.closed)
            if not self.inbox:
                raise AnswersExhausted(f"The run was closed while waiting for '{key}'.")
            self.pending = None
            self.pending_choice = None
            return self.inbox.pop(0)


@dataclass
class Session:
    id: str
    run_dir: Path
    brief: str
    mode: str
    provider: str
    model: str
    answers: WebAnswers = field(init=False)
    messages: list[str] = field(default_factory=list)
    history: list[dict[str, str]] = field(default_factory=list)
    notice: dict[str, Any] | None = None
    done: bool = False
    outcome: str | None = None
    error: str | None = None
    touched: float = field(default_factory=time.monotonic)
    site_id: str | None = None  # the founder's live Netlify site. The token is never kept.
    site_url: str | None = None
    deploy_lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self.answers = WebAnswers(self.save)

    # -- state the UI reads ---------------------------------------------------
    def pending(self) -> dict[str, Any] | None:
        if self.done or self.answers.pending is None:
            return None
        key, prompt = self.answers.pending
        if key == "level_up":
            info = self.answers.pending_choice or {}
            return {"kind": "level_up", "key": key, "prompt": prompt,
                    **{k: info.get(k) for k in ("done", "stage", "next", "proof")}}
        if not key.endswith("_option"):
            return {"kind": "question", "key": key, "prompt": prompt}
        choice = self.answers.pending_choice or {}
        return {"kind": "gate", "key": key.removesuffix("_option"), "prompt": choice.get("question", ""),
                "options": choice.get("options", [])}

    def status(self) -> str:
        if self.error:
            return "error"
        if self.done:
            return "done"
        pending = self.pending()
        if pending is None or self.answers.inbox:
            return "working"
        return "gate" if pending["kind"] == "gate" else "waiting"

    def state(self) -> dict[str, Any]:
        progress = _read_json(self.run_dir / "state.json") or {}
        outputs_dir = self.run_dir / "outputs"
        outputs = sorted(p.name for p in outputs_dir.iterdir()) if outputs_dir.exists() else []
        return {"id": self.id, "status": self.status(), "stage": self.stage(progress.get("step", "start")),
                "outcome": self.outcome or progress.get("outcome"), "mode": self.mode,
                "provider": self.provider, "model": self.model, "phase1": progress.get("phase1"), "phase2": progress.get("phase2"),
                "phase3": progress.get("phase3"),
                "pending": self.pending(), "notice": self.notice, "messages": self.messages,
                "outputs": outputs, "sources": _sources(outputs_dir), "error": self.error,
                "delivery": {"approved": self.publish_approval() is not None, "url": self.site_url,
                             "site_id": self.site_id}}

    def publish_approval(self) -> dict[str, Any] | None:
        """The founder's logged approval to publish the sign-up page, or None. Read from the log, not the UI."""
        for entry in reversed(DecisionLog(self.run_dir / "decision_log.json").entries()):
            if (entry.get("action") == "publish_signup_page" and entry.get("approved_by") == "founder"
                    and entry.get("outcome") != "failed" and (entry.get("founder_input") or "").strip()):
                return entry
        return None

    def stage(self, saved_step: str) -> str:
        """The step the founder is on. A pending gate names itself; the pipeline saves it only after."""
        pending = self.pending()
        if pending and pending["kind"] == "gate":
            return {"publish": "phase2_step2"}.get(pending["key"], f"{pending['key']}_gate")
        return saved_step

    def save(self) -> None:
        """Persist what the UI shows, plus the founder's answers. No keys are ever in here."""
        self.run_dir.mkdir(parents=True, exist_ok=True)
        data = {**self.state(), "brief": self.brief, "history": self.history}
        (self.run_dir / "session.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n",
                                                   encoding="utf-8")

    # -- founder input --------------------------------------------------------
    def send(self, texts: list[str], timeout: float) -> None:
        """Hand answers to the waiting pipeline, then wait until it asks again or ends."""
        a = self.answers
        with a.cv:
            key = a.pending[0] if a.pending else "?"
            self.history += [{"key": key, "text": t} for t in texts]
            a.inbox.extend(texts)
            a.cv.notify_all()
            a.cv.wait_for(lambda: not a.inbox and (a.pending is not None or self.done), timeout=timeout)
        self.save()

    def wait_idle(self, timeout: float) -> None:
        a = self.answers
        with a.cv:
            a.cv.wait_for(lambda: a.pending is not None or self.done, timeout=timeout)


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _sources(outputs_dir: Path) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for path in sorted(outputs_dir.glob("*_sources.json")) if outputs_dir.exists() else []:
        found += _read_json(path) or []
    return found


class _BodyTooBig(Exception):
    pass


class BodyLimit:
    """Answer 413 to any request body over the limit, before the app reads it."""

    def __init__(self, app: Any, limit: int = MAX_BODY_BYTES) -> None:
        self.app, self.limit = app, limit

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        declared = dict(scope["headers"]).get(b"content-length", b"0")
        started = False
        seen = 0

        async def counted() -> Any:
            nonlocal seen
            message = await receive()
            seen += len(message.get("body", b"")) if message["type"] == "http.request" else 0
            if seen > self.limit:
                raise _BodyTooBig
            return message

        async def tracked(message: Any) -> None:
            nonlocal started
            started = started or message["type"] == "http.response.start"
            await send(message)

        try:
            if declared.isdigit() and int(declared) > self.limit:
                raise _BodyTooBig
            await self.app(scope, counted, tracked)
        except _BodyTooBig:
            if started:
                raise
            body = b'{"detail":"That request is too big. The limit is 64 KB."}'
            await send({"type": "http.response.start", "status": 413,
                        "headers": [(b"content-type", b"application/json"),
                                    (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})


def create_app(*, llm_factory: LLMFactory = _default_llm, search_factory: SearchFactory | None = None,
               config_path: Path = ROOT / "config.yaml", wait_seconds: float | None = None,
               max_sessions: int = MAX_SESSIONS) -> FastAPI:
    app = FastAPI(title="KAYA API")
    app.add_middleware(BodyLimit)
    sessions: dict[str, Session] = {}
    wait = wait_seconds if wait_seconds is not None else float(os.environ.get("API_WAIT_SECONDS", "30"))
    make_search = search_factory or (lambda cfg: SearxSearch(cfg.searxng_url))

    def config(mode: str | None = None) -> Config:
        cfg = load_config(config_path)
        return cfg.model_copy(update={"mode": mode}) if mode else cfg

    def runs_dir() -> Path:
        return Path(config().runs_dir)

    def get(run_id: str) -> Session:
        if run_id not in sessions:
            raise HTTPException(404, "No run with that id is open.")
        sessions[run_id].touched = time.monotonic()
        return sessions[run_id]

    def evict_idle() -> None:
        """Keep at most max_sessions - 1 live runs before a new one starts: drop the oldest idle."""
        while len(sessions) >= max_sessions:
            oldest = min(sessions.values(), key=lambda s: s.touched)
            del sessions[oldest.id]
            with oldest.answers.cv:
                oldest.answers.closed = True  # lets its pipeline thread end
                oldest.answers.cv.notify_all()

    def work(session: Session, ctx: Ctx, key: str | None) -> None:
        try:
            result = run_pipeline(ctx, session.brief)
            session.outcome = result.outcome
        except Exception as err:  # shown to the founder; the key is scrubbed out
            session.error = _scrub(f"{type(err).__name__}: {err}", key)
        with session.answers.cv:
            session.done = True
            session.answers.cv.notify_all()
        session.save()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/runs", status_code=201)
    def new_run(body: NewRun, x_model_key: str | None = Header(default=None)) -> dict[str, Any]:
        cfg = with_model(config(body.mode), body.model)
        try:
            llm = llm_factory(cfg, body.provider, x_model_key)
        except ValueError as err:
            raise HTTPException(422, _scrub(str(err), x_model_key)) from None
        run_id = uuid.uuid4().hex[:12]
        session = Session(run_id, runs_dir() / run_id, body.brief, body.mode, body.provider, cfg.model.default)
        ctx = Ctx(cfg=cfg, llm=llm, search=make_search(cfg), log=DecisionLog(session.run_dir / "decision_log.json"),
                  answers=session.answers, run_dir=session.run_dir, say=session.messages.append)
        evict_idle()
        sessions[run_id] = session
        session.save()
        threading.Thread(target=work, args=(session, ctx, x_model_key), daemon=True).start()
        session.wait_idle(wait)
        return session.state()

    @app.post("/onboarding/next")
    def onboarding_next(body: NextQuestion, x_model_key: str | None = Header(default=None)) -> dict[str, Any]:
        """One personal follow-up question, or the profile when enough is known. Model trouble never blocks it."""
        cfg = with_model(config(body.mode), body.model)
        for item in body.answers:
            verdict = check_answer(item.answer)
            if not verdict.allowed:
                raise HTTPException(422, f"{verdict.reason} Instead: {(verdict.alternative or '').rstrip('.')}.")
        try:
            llm: LLM | None = llm_factory(cfg, body.provider, x_model_key)
        except ValueError:
            llm = None  # no key or no model: the fixed questions still work
        return next_step(cfg, body.mode, llm, body.answers)

    @app.get("/runs/{run_id}")
    def read_run(run_id: str) -> dict[str, Any]:
        if run_id in sessions:
            return get(run_id).state()
        saved = _read_json(runs_dir() / run_id / "session.json") if re.fullmatch(r"\w+", run_id) else None
        if saved is None:
            raise HTTPException(404, "No run with that id.")
        if saved.get("status") != "done":
            saved.update(status="closed", pending=None)  # the server restarted; start a new run
        return saved

    @app.post("/runs/{run_id}/answer")
    def answer(run_id: str, body: Answer) -> dict[str, Any]:
        session = get(run_id)
        pending = session.pending()
        if pending is None or pending["kind"] not in ("question", "level_up"):
            raise HTTPException(409, "The run is not waiting for an answer right now.")
        if body.text.strip() == NEXT_STAGE:
            raise HTTPException(422, "Use the move on button to go to the next stage.")
        verdict = check_answer(body.text)
        if not verdict.allowed:
            DecisionLog(session.run_dir / "decision_log.json").append(
                "guardrail", "refuse_request", founder_input=body.text, outcome=verdict.rule)
            session.notice = {"refused": True, "rule": verdict.rule, "reason": verdict.reason,
                              "alternative": verdict.alternative}
            session.save()
            return session.state()
        session.notice = None
        session.send([body.text], wait)
        return session.state()

    @app.post("/runs/{run_id}/next")
    def next_stage(run_id: str) -> dict[str, Any]:
        """Move on after a finished stage. The pipeline logs it as the founder's action."""
        session = get(run_id)
        pending = session.pending()
        if pending is None or pending["kind"] != "level_up":
            raise HTTPException(409, "The run is not at the end of a stage right now.")
        session.notice = None
        session.send([NEXT_STAGE], wait)
        return session.state()

    @app.post("/runs/{run_id}/gate")
    def gate(run_id: str, body: Choice) -> dict[str, Any]:
        session = get(run_id)
        pending = session.pending()
        if pending is None or pending["kind"] != "gate":
            raise HTTPException(409, "The run is not waiting for a decision right now.")
        for text in (body.option, body.reason):
            verdict = check_answer(text)
            if not verdict.allowed:
                raise HTTPException(422, f"{verdict.reason}. Instead: {verdict.alternative}.")
        names = [o["name"] for o in pending["options"]]
        try:
            approval = check_approval(body.option, body.reason, names, config(session.mode))
        except ApprovalError as err:
            raise HTTPException(422, str(err)) from None
        session.notice = None
        session.send([approval.option, approval.reason], wait)
        return session.state()

    @app.get("/runs/{run_id}/log")
    def read_log(run_id: str) -> list[dict[str, Any]]:
        run_dir = sessions[run_id].run_dir if run_id in sessions else runs_dir() / run_id
        if not re.fullmatch(r"\w+", run_id) or not run_dir.exists():
            raise HTTPException(404, "No run with that id.")
        return DecisionLog(run_dir / "decision_log.json").entries()

    def plan_for(run_id: str) -> tuple[Path, dict[str, Any]]:
        """The run dir and the state the plan overview reads. 404 like the log endpoint."""
        if not re.fullmatch(r"\w+", run_id):
            raise HTTPException(404, "No run with that id.")
        run_dir = sessions[run_id].run_dir if run_id in sessions else runs_dir() / run_id
        if not run_dir.exists():
            raise HTTPException(404, "No run with that id.")
        state = sessions[run_id].state() if run_id in sessions else (_read_json(run_dir / "session.json") or {})
        return run_dir, state

    @app.get("/runs/{run_id}/program")
    def read_program(run_id: str) -> dict[str, Any]:
        """This week's accelerator card for the run's current stage, with the coach handoff line."""
        run_dir, state = plan_for(run_id)
        stage = program.stage_for(state.get("stage") or "start", state.get("status") or "", state.get("outcome"))
        words = program.words_from_profile(_read_json(run_dir / "outputs" / "phase1_step1_founder_profile.json"))
        return {"stage": stage, "card": program.card(stage, words, program.previous_stage(stage))}

    @app.get("/runs/{run_id}/plan")
    def read_plan(run_id: str) -> dict[str, Any]:
        run_dir, state = plan_for(run_id)
        return build_plan(run_dir, state)

    @app.get("/runs/{run_id}/plan/versions/{n}")
    def read_plan_version(run_id: str, n: int) -> dict[str, Any]:
        run_dir, _ = plan_for(run_id)
        version = get_version(run_dir, n)
        if version is None:
            raise HTTPException(404, "No plan version with that number.")
        return version

    @app.get("/runs/{run_id}/plan.md")
    def read_plan_markdown(run_id: str) -> PlainTextResponse:
        run_dir, state = plan_for(run_id)
        return PlainTextResponse(
            plan_markdown(build_plan(run_dir, state), run_id), media_type="text/markdown; charset=utf-8",
            headers={"content-disposition": f'attachment; filename="business-plan-{run_id}.md"'})

    def netlify_token(token: str | None) -> str:
        if not token or not token.strip():
            raise HTTPException(422, "Paste your Netlify token first.")
        return token.strip()

    def log_delivery(session: Session, action: str, approval: dict[str, Any], url: str | None, outcome: str) -> None:
        DecisionLog(session.run_dir / "decision_log.json").append(
            "delivery", action, sources=[url] if url else [], approved_by="founder",
            founder_input=approval["founder_input"], outcome=outcome)

    @app.post("/runs/{run_id}/publish/netlify")
    def publish_netlify(run_id: str, x_netlify_token: str | None = Header(default=None)) -> dict[str, Any]:
        """Put the page the founder approved online. Refused unless the log holds that approval."""
        session = get(run_id)
        approval = session.publish_approval()
        page = session.run_dir / "outputs" / "phase2_step2_signup_page.md"
        if approval is None or not page.exists():
            raise HTTPException(409, "Publishing waits for your decision. Approve the sign-up page first.")
        token = netlify_token(x_netlify_token)
        with session.deploy_lock:
            if session.site_id:
                raise HTTPException(409, "Your page is already online. Take it down before publishing again.")
            try:
                done = NetlifyPublisher(token).deploy(run_id, page.read_text(encoding="utf-8"))
            except DeliveryError as err:
                log_delivery(session, "deploy_netlify", approval, None, "failed")
                raise HTTPException(err.status, _scrub(str(err), token)) from None
            session.site_id, session.site_url = done.site_id, done.url
            log_delivery(session, "deploy_netlify", approval, done.url, "deployed")
        session.save()
        return {"url": done.url, "site_id": done.site_id}

    @app.delete("/runs/{run_id}/publish/netlify")
    def take_down_netlify(run_id: str, x_netlify_token: str | None = Header(default=None)) -> dict[str, Any]:
        session = get(run_id)
        approval = session.publish_approval()
        if approval is None or not session.site_id:
            raise HTTPException(409, "Your page is not online, so there is nothing to take down.")
        token = netlify_token(x_netlify_token)
        with session.deploy_lock:
            url = session.site_url
            try:
                NetlifyPublisher(token).take_down(session.site_id)
            except DeliveryError as err:
                log_delivery(session, "take_down_netlify", approval, url, "failed")
                raise HTTPException(err.status, _scrub(str(err), token)) from None
            session.site_id = session.site_url = None
            log_delivery(session, "take_down_netlify", approval, url, "taken_down")
        session.save()
        return {"url": None, "site_id": None}

    @app.get("/models")
    def models() -> dict[str, Any]:
        """The models the founder can pick, and whether Ollama has each one downloaded yet."""
        cfg = config()
        try:
            resp = httpx.get(f"{cfg.model.ollama_url}/api/tags", timeout=3)
            resp.raise_for_status()
            have = {m.get("name") for m in resp.json().get("models", []) if isinstance(m, dict)}
            installed = lambda name: name in have  # noqa: E731
        except (httpx.HTTPError, ValueError):
            installed = lambda name: None  # noqa: E731
        return {"default": cfg.model.default,
                "choices": [{"name": n, "installed": installed(n)} for n in cfg.model.choices]}

    @app.post("/model/test")
    def model_test(body: ModelTest, x_model_key: str | None = Header(default=None)) -> dict[str, Any]:
        """One tiny model call. The key is used once and never stored, logged or echoed."""
        cfg = with_model(config(), body.model)
        try:
            llm = llm_factory(cfg, body.provider, x_model_key)
            llm.complete("Reply with JSON only.", 'Reply {"ok": true}.', _Ping)
        except (LLMError, ValueError, OSError) as err:
            return {"ok": False, "provider": body.provider, "error": _scrub(str(err), x_model_key)}
        return {"ok": True, "provider": body.provider, "model": llm.name}

    return app


app = create_app()
