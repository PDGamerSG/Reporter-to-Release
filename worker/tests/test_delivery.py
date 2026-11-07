import sqlite3

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
