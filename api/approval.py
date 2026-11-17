"""Founder approval. Nothing publishable runs without a valid Approval."""
from __future__ import annotations

import functools
import re
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])
_SEAL = object()  # only check_approval stamps this, so hand-made records fail


class ApprovalError(ValueError):
    """The founder's answer is not a valid approval."""


@dataclass(frozen=True)
class Approval:
    option: str
    reason: str
    approved_by: str = "founder"
    _seal: object = field(default=None, compare=False, repr=False)


def _normalize(text: str) -> str:
    """Lowercase, drop punctuation, squeeze spaces."""
    return " ".join(re.sub(r"[^\w\s]", " ", text.lower()).split())


MIN_DISTINCT_WORDS = 3


def _real_words(reason: str, rejected: set[str]) -> list[str]:
    """Words left after dropping filler answers like yes, ok or looks good."""
    text = f" {_normalize(reason)} "
    for answer in sorted(rejected, key=len, reverse=True):
        text = re.sub(rf"(?<= ){re.escape(answer)}(?= )", " ", text)
    return text.split()


def check_approval(option: str | None, reason: str | None,
                   options: list[str], cfg: Any) -> Approval:
    """Return an Approval, or raise ApprovalError with a short plain message."""
    picked = _match_option(option, options)
    reason = (reason or "").strip()
    if not reason:
        raise ApprovalError("Tell us why you picked it, in your own words.")
    rejected = {_normalize(a) for a in cfg.approval.rejected_answers}
    if _normalize(reason) in rejected:
        raise ApprovalError("Tell us why in your own words, not just yes.")
    words = _real_words(reason, rejected)
    if len(set(words)) < MIN_DISTINCT_WORDS:
        raise ApprovalError("Tell us why in your own words, not just yes.")
    need = cfg.min_reason_words
    if len(words) < need:
        raise ApprovalError(f"Your reason needs at least {need} words.")
    return Approval(picked, reason, "founder", _SEAL)


def _match_option(option: str | None, options: list[str]) -> str:
    """Return the listed option the founder picked, ignoring case and spaces."""
    if not option or not option.strip():
        raise ApprovalError("Pick one option first.")
    for listed in options:
        if _normalize(listed) == _normalize(option):
            return listed
    raise ApprovalError(f"That option is not on the list: {option.strip()}")


def ensure_approved(approval: object, action: str) -> Approval:
    """Raise unless approval is a founder record made by check_approval."""
    if not isinstance(approval, Approval) or approval._seal is not _SEAL:
        raise ApprovalError(f"No founder approval for: {action}")
    if approval.approved_by != "founder":
        raise ApprovalError(f"Only the founder can approve: {action}")
    return approval


def require_approval(action: str) -> Callable[[F], F]:
    """Block the wrapped call unless it gets approval=<valid Approval>."""
    def decorate(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            ensure_approved(kwargs.get("approval"), action)
            return func(*args, **kwargs)
        return wrapper  # type: ignore[return-value]
    return decorate
