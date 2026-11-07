import sqlite3

import httpx
import pytest
from r2r_worker.main import Worker


@pytest.mark.asyncio
async def test_delivery_recovers_when_the_dossier_already_exists_after_a_restart():
    worker = Worker.__new__(Worker)
    worker.db = sqlite3.connect(":memory:")
    worker.db.execute("CREATE TABLE deliveries (id TEXT PRIMARY KEY)")
    calls = []

    async def post(path, body):
        return {"url": "https://github.com/acme/shop/issues/1"}

    class Switch:
        async def op(self, operation, args, connection_id=None):
            calls.append(operation)
            if operation == "list_references":
                return {"documents": [{"id": "doc-1", "name": "dossier-R2R-0001"}]}
            if operation == "update_room_document":
                return {"document_id": "doc-1"}
            raise AssertionError(operation)

    class Engineering:
        connection_id = "engineering"

        async def create_room_document(self, *args):
            raise AssertionError("A previous attempt already created this document")

        async def send_targeted_message(self, *args, **kwargs):
            calls.append("sent")

    worker.post = post
    worker.switch = Switch()
    job = {
        "id": "delivery-1",
        "channel": "engineering",
        "kind": "dossier",
        "clusterId": "R2R-0001",
        "body": "Sanitized facts",
    }
    await worker.deliver(job, None, Engineering())
    await worker.deliver(job, None, Engineering())
    assert calls == ["list_references", "update_room_document", "sent"]
    worker.db.close()


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "failed",
                request=httpx.Request("POST", "https://example.test"),
                response=httpx.Response(self.status_code),
            )


class FakeTelegram:
    def __init__(self, status_code=200):
        self.status_code = status_code
        self.sent = []

    async def post(self, path, json):
        self.sent.append((path, json))
        return FakeResponse(self.status_code)


def telegram_worker(client):
    worker = Worker.__new__(Worker)
    worker.db = sqlite3.connect(":memory:")
    worker.db.execute("CREATE TABLE deliveries (id TEXT PRIMARY KEY)")
    worker.telegram = client
    return worker


TELEGRAM_JOB = {
    "id": "telegram-1",
    "channel": "reporter",
    "kind": "release",
    "source": "web",
    "telegramChatId": 42,
    "body": "R2R-0001 is live.",
}


@pytest.mark.asyncio
async def test_linked_web_reporter_gets_one_telegram_message():
    client = FakeTelegram()
    worker = telegram_worker(client)
    await worker.deliver(TELEGRAM_JOB, None, None)
    await worker.deliver(TELEGRAM_JOB, None, None)
    assert client.sent == [
        ("sendMessage", {"chat_id": 42, "text": "R2R-0001 is live."})
    ]
    worker.db.close()


@pytest.mark.asyncio
async def test_blocked_bot_is_not_retried_but_a_server_failure_is():
    blocked = telegram_worker(FakeTelegram(403))
    await blocked.deliver(TELEGRAM_JOB, None, None)
    assert blocked.db.execute("SELECT count(*) FROM deliveries").fetchone()[0] == 1
    blocked.db.close()
    failing = telegram_worker(FakeTelegram(500))
    with pytest.raises(httpx.HTTPStatusError):
        await failing.deliver(TELEGRAM_JOB, None, None)
    assert failing.db.execute("SELECT count(*) FROM deliveries").fetchone()[0] == 0
    failing.db.close()
