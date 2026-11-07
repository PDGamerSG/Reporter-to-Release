import asyncio
import sqlite3

import httpx
import pytest
from r2r_worker.main import Worker


@pytest.mark.asyncio
async def test_stale_reporter_answer_is_acknowledged_and_does_not_block_next_outcome(
    monkeypatch,
):
    worker = Worker.__new__(Worker)
    worker.db = sqlite3.connect(":memory:")
    worker.db.execute(
        "CREATE TABLE pending_cards (id TEXT PRIMARY KEY, session TEXT, report TEXT, reporter TEXT, phase TEXT, room TEXT, thread TEXT, detail TEXT)"
    )
    for key in ["late", "current"]:
        worker.db.execute(
            "INSERT INTO pending_cards VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                key,
                "session",
                key,
                "original-reporter",
                "reproduction",
                "public",
                None,
                "Observed behavior",
            ),
        )
    answered = []
    delivered = []

    async def post(path, body):
        answered.append(body["reportId"])
        if body["reportId"] == "late":
            response = httpx.Response(
                409,
                request=httpx.Request(
                    "POST", "https://desk.example/api/worker/answers"
                ),
            )
            response.raise_for_status()
        return {"ok": True}

    class SwitchHTTP:
        async def get(self, path):
            return httpx.Response(
                200,
                request=httpx.Request("GET", "https://switch.example" + path),
                json=[
                    {
                        "requestId": key,
                        "state": "answered",
                        "answer": "yes",
                        "answeredBy": "original-reporter",
                    }
                    for key in ["late", "current"]
                ],
            )

        async def post(self, path):
            delivered.append(path)
            return httpx.Response(
                200,
                request=httpx.Request("POST", "https://switch.example" + path),
                json={},
            )

    worker.post = post
    worker.http = SwitchHTTP()

    async def stop_after_first_poll(_):
        raise asyncio.CancelledError

    monkeypatch.setattr("r2r_worker.main.asyncio.sleep", stop_after_first_poll)
    with pytest.raises(asyncio.CancelledError):
        await worker.outcomes()
    assert answered == ["late", "current"]
    assert len(delivered) == 2
    assert worker.db.execute("SELECT COUNT(*) FROM pending_cards").fetchone()[0] == 0
    worker.db.close()
