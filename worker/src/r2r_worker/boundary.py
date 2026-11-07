"""Trust checks shared by the worker and its tests. No public commands execute."""
import json
import re

AGENT_ACTIONS = {"start_reproduction", "propose_reproduction", "start_fix", "submit_fix"}


def parse_engineering_command(body: str, sender: str | None, allowed: set[str]):
    if not sender or sender not in allowed or not body.strip().startswith("/r2r "):
        return None
    try:
        data = json.loads(body.strip()[5:])
        bug_id = data.pop("bugId")
        if not re.fullmatch(r"R2R-\d{4,}", bug_id) or data.get("type") not in AGENT_ACTIONS:
            return None
        return bug_id, data
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


def reporter_answer(outcome: dict, expected_user: str):
    if outcome.get("state") != "answered" or outcome.get("answeredBy") != expected_user:
        return None
    answer = outcome.get("answer")
    if answer in {"yes", "confirm", "approved"}:
        return True
    if answer in {"no", "reject", "rejected"}:
        return False
    return None
