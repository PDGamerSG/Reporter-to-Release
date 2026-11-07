import asyncio
import hashlib
from contextlib import asynccontextmanager
from types import SimpleNamespace

import httpx
import pytest
from r2r_engineering.github import GitHubPublisher
from r2r_engineering.model import parse_object
from r2r_engineering.runtime import Runtime
from r2r_engineering.sandbox import apply_files, regression_path
from r2r_engineering.state import State, eligible_stage


def test_generated_edits_cannot_escape_the_shop_lite_boundary(tmp_path):
    path = regression_path("R2R-0002")
    apply_files(tmp_path, {path: "test source"}, {path})
    assert (tmp_path / path).read_text() == "test source"
    for forbidden in [
        "../outside",
        ".github/workflows/ci.yml",
        "src/lib/security.ts",
        "src/components/ui.tsx",
    ]:
        with pytest.raises(ValueError):
            apply_files(tmp_path, {forbidden: "bad"}, {path})


def test_generated_edits_reject_symlinks_and_oversized_output(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    (tmp_path / "tests").symlink_to(outside, target_is_directory=True)
    path = regression_path("R2R-0003")
    with pytest.raises(ValueError):
        apply_files(tmp_path, {path: "bad"}, {path})
    assert not list(outside.iterdir())
    with pytest.raises(ValueError):
        parse_object("x" * 100_000)
    with pytest.raises(TypeError):
        parse_object('[{"shell":"curl"}]')
    assert (
        parse_object('```json\n{"status":"needs_information"}\n```')["status"]
        == "needs_information"
    )


def test_reporter_confirmation_is_required_before_scheduling_fix():
    assert eligible_stage({"state": "awaiting_reporter"}) is None
    assert eligible_stage({"state": "confirmed"}) is None
    assert (
        eligible_stage({"state": "confirmed", "reporterConfirmedAt": "2026-11-07"})
        == "fix"
    )
    assert eligible_stage({"state": "new"}) == "reproduce"


def test_model_call_limit_survives_process_restart(tmp_path):
    path = tmp_path / "runtime.sqlite"
    state = State(path, daily_limit=2)
    state.reserve_call()
    state.reserve_call()
    state.db.close()
    restarted = State(path, daily_limit=2)
    with pytest.raises(ValueError, match="daily"):
        restarted.reserve_call()
    restarted.save(
        "R2R-0002", "reproduce", {"status": "blocked", "reason": "Need steps"}
    )
    assert restarted.load("R2R-0002", "reproduce")["reason"] == "Need steps"
    restarted.db.close()


@pytest.mark.asyncio
async def test_publication_reuses_a_matching_draft_pr_without_new_writes():
    base, head = "a" * 40, "b" * 40
    branch = "r2r/r2r-0002-aaaaaaa"
    writes = []

    def handle(request):
        if request.method != "GET":
            writes.append(request.url.path)
            return httpx.Response(500)
        if "/git/ref/" in request.url.path:
            return httpx.Response(200, json={"object": {"sha": head}})
        if request.url.path.endswith("/pulls"):
            assert request.url.params["head"] == f"PDGamerSG:{branch}"
            return httpx.Response(
                200,
                json=[
                    {
                        "number": 2,
                        "html_url": "https://github.com/PDGamerSG/Reporter-to-Release/pull/2",
                        "head": {"sha": head},
                        "draft": True,
                    }
                ],
            )
        if "/compare/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "status": "ahead",
                    "merge_base_commit": {"sha": base},
                    "files": [{"filename": "src/lib/shoplite.ts"}],
                },
            )
        if "/contents/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "type": "file",
                    "sha": hashlib.sha1(
                        b"blob 4\0safe", usedforsecurity=False
                    ).hexdigest(),
                },
            )
        return httpx.Response(404)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle), base_url="https://api.github.com"
    ) as http:
        publisher = GitHubPublisher("PDGamerSG/Reporter-to-Release", http)
        result = await publisher.publish(
            "R2R-0002",
            base,
            {"src/lib/shoplite.ts": "safe"},
            "Actual tests passed",
            "Advisory model review",
        )
    assert result["prNumber"] == 2
    assert result["headSha"] == head
    assert writes == []


@pytest.mark.asyncio
async def test_existing_branch_cannot_reuse_evidence_for_different_source():
    base, head = "a" * 40, "b" * 40

    def handle(request):
        if "/git/ref/" in request.url.path:
            return httpx.Response(200, json={"object": {"sha": head}})
        if "/compare/" in request.url.path:
            return httpx.Response(
                200,
                json={
                    "status": "ahead",
                    "merge_base_commit": {"sha": base},
                    "files": [{"filename": "src/lib/shoplite.ts"}],
                },
            )
        if "/contents/" in request.url.path:
            return httpx.Response(200, json={"type": "file", "sha": "c" * 40})
        if request.url.path.endswith("/pulls"):
            return httpx.Response(
                200,
                json=[
                    {
                        "number": 2,
                        "html_url": "https://github.com/PDGamerSG/Reporter-to-Release/pull/2",
                        "head": {"sha": head},
                        "draft": True,
                    }
                ],
            )
        return httpx.Response(500)

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handle), base_url="https://api.github.com"
    ) as http:
        with pytest.raises(ValueError, match="tested patch"):
            await GitHubPublisher("PDGamerSG/Reporter-to-Release", http).publish(
                "R2R-0002",
                base,
                {"src/lib/shoplite.ts": "freshly measured patch"},
                "PASS",
                "Advisory",
            )


@pytest.mark.asyncio
async def test_transient_delivery_failure_preserves_completed_reproduction(tmp_path):
    runtime = Runtime.__new__(Runtime)
    runtime.state = State(tmp_path / "state.sqlite")
    artifact = {
        "status": "complete",
        "baseSha": "a" * 40,
        "testSource": "real regression",
    }

    async def reproduce(cluster, fingerprint):
        runtime.state.save(cluster["id"], "reproduce", artifact)
        raise httpx.ConnectError("transient delivery failure")

    async def note(*_):
        pass

    runtime.reproduce = reproduce
    runtime.note = note
    await runtime.process(
        {"id": "R2R-0002", "state": "reproducing", "dossier": {"title": "Overflow"}}
    )
    assert runtime.state.load("R2R-0002", "reproduce") == artifact
    assert runtime.state.load("R2R-0002", "reproduce:failure")["retryAfter"] > 0


@pytest.mark.asyncio
async def test_reporter_rejection_discards_previous_round_before_new_reproduction(
    tmp_path,
):
    runtime = Runtime.__new__(Runtime)
    runtime.state = State(tmp_path / "state.sqlite")
    runtime.state.save(
        "R2R-0002", "reproduce", {"status": "complete", "testSource": "rejected test"}
    )
    runtime.state.save("R2R-0002", "fix", {"status": "complete", "prUrl": "old PR"})
    observed = []

    async def action(*_):
        pass

    async def reproduce(cluster, fingerprint):
        observed.append(
            (
                runtime.state.load(cluster["id"], "reproduce"),
                runtime.state.load(cluster["id"], "fix"),
            )
        )

    async def note(*_):
        pass

    runtime.action = action
    runtime.reproduce = reproduce
    runtime.note = note
    await runtime.process(
        {
            "id": "R2R-0002",
            "state": "reopened",
            "dossier": {"title": "Same facts, wrong reproduction"},
        }
    )
    assert observed == [(None, None)]


@pytest.mark.asyncio
async def test_restart_publishes_prepared_fix_without_regenerating_it(tmp_path):
    runtime = Runtime.__new__(Runtime)
    runtime.root = tmp_path
    runtime.state = State(tmp_path / "runtime.sqlite")
    workspace = tmp_path / "runs/R2R-0002"
    workspace.mkdir(parents=True)
    runtime.state.save(
        "R2R-0002",
        "reproduce",
        {
            "status": "complete",
            "workdir": str(workspace),
            "baseSha": "a" * 40,
            "round": "d" * 32,
            "testSource": "unchanged test",
        },
    )
    files = {
        "src/lib/shoplite.ts": "measured source",
        "tests/agent-r2r-0002.test.ts": "unchanged test",
    }
    runtime.state.save(
        "R2R-0002",
        "fix:prepared",
        {
            "files": files,
            "summary": "Measured fix",
            "output": "Actual passing assertion",
            "review": "Advisory review",
            "usage": [],
        },
    )
    recorded = []

    class Publisher:
        async def publish(self, bug, base, patch, output, review, generation=""):
            assert patch == files
            assert generation == "d" * 32
            return {
                "prUrl": "https://github.com/PDGamerSG/Reporter-to-Release/pull/3",
                "prNumber": 3,
                "headSha": "b" * 40,
            }

    async def action(bug, command):
        recorded.append(command)

    runtime.publisher = Publisher()
    runtime.action = action
    await runtime.fix({"id": "R2R-0002"})
    assert recorded[0]["testOutput"] == "Actual passing assertion"
    assert runtime.state.load("R2R-0002", "fix")["status"] == "complete"


@pytest.mark.asyncio
async def test_meta_runtime_uses_only_completed_output_and_persistent_call_budget(
    tmp_path,
):
    from r2r_engineering.model import Meta

    state = State(tmp_path / "meta.sqlite", daily_limit=1)
    requests = []

    def handle(request):
        import json

        payload = json.loads(request.content)
        assert payload["store"] is False
        assert "private-provider-key" not in request.content.decode()
        requests.append(payload)
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [
                    {
                        "type": "reasoning",
                        "summary": [{"text": "not application output"}],
                    },
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": '{"approved":true,"reason":"Measured assertion matches the reported failure."}',
                            }
                        ],
                    },
                ],
                "usage": {"input_tokens": 400, "output_tokens": 120},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as http:
        model = Meta(state, "private-provider-key", http=http)
        value, usage = await model.ask(
            "independent advisory reviewer",
            "Review the measured assertion.",
            {"sanitized": "facts"},
        )
        assert value["approved"] is True
        assert usage["totalTokens"] == 520
        with pytest.raises(ValueError, match="daily"):
            await model.ask("independent advisory reviewer", "Review again.", {})
    assert len(requests) == 1


@pytest.mark.asyncio
async def test_handoff_accepts_the_native_switch_room_id_and_checks_sender(tmp_path):
    runtime = Runtime.__new__(Runtime)
    runtime.state = State(tmp_path / "runtime.sqlite")
    queues = {name: asyncio.Queue() for name in ["manager", "reproducer", "reviewer"]}

    class Room:
        def __init__(self, name):
            self.name = name

        async def send_targeted_message(self, body, target_names):
            for target in target_names:
                await queues[target.removeprefix("vulcan-")].put(
                    SimpleNamespace(
                        sender="@switch-agent-transport:localhost",
                        message_id="server-issued-event",
                        addressed=True,
                        body="@" + target + "\n" + body,
                    )
                )
            return {"event_id": "server-issued-event"}

        async def messages(self):
            yield await queues[self.name].get()

    class Client:
        def __init__(self, name):
            self.name = name
            self.agent_id = name + "-id"

        async def op(self, operation, args):
            return {"id": "2c340335-9092-4c94-86bd-b41a2d9a20c1"}

        @asynccontextmanager
        async def connect(self, room, connection, only_addressed):
            assert room == "2c340335-9092-4c94-86bd-b41a2d9a20c1"
            yield Room(self.name)

    runtime.clients = {name: Client(name) for name in queues}
    async with runtime.handoff("R2R-0002", "reproducer", "reproduce") as room:
        assert "reproducer" in room


def test_switch_handoff_requires_the_authenticated_send_receipt():
    from r2r_engineering.runtime import handoff_matches

    task = '/engineering-task {"taskId":"unique-task"}'
    message = SimpleNamespace(
        sender="@switch-agent-transport:localhost",
        message_id="server-issued-event",
        addressed=True,
        body="@vulcan-reproducer " + task,
    )
    assert handoff_matches(message, "server-issued-event", "vulcan-reproducer", task)
    message.message_id = "unrelated-event"
    assert not handoff_matches(
        message, "server-issued-event", "vulcan-reproducer", task
    )
    message.message_id = "server-issued-event"
    message.addressed = False
    assert not handoff_matches(
        message, "server-issued-event", "vulcan-reproducer", task
    )
    message.addressed = True
    message.body = "@vulcan-fixer " + task
    assert not handoff_matches(
        message, "server-issued-event", "vulcan-reproducer", task
    )


@pytest.mark.asyncio
async def test_heartbeat_retries_while_model_stage_is_busy_and_stops_with_runtime(
    monkeypatch,
):
    import json

    import r2r_engineering.runtime as module

    monkeypatch.setenv("SWITCH_ENGINEERING_ROOM", "private-engineering-room")
    monkeypatch.setattr(module, "HEARTBEAT_INTERVAL", 0.01, raising=False)
    runtime = Runtime.__new__(Runtime)
    runtime.provider = "meta"
    runtime.model = SimpleNamespace(model="muse-spark-1.3", key="private-model-key")
    processing = asyncio.Event()
    received = asyncio.Event()
    closed = []
    payloads = []
    rooms = [SimpleNamespace(is_connected=i < 3) for i in range(4)]

    class Client:
        def __init__(self, index):
            self.index = index

        @asynccontextmanager
        async def connect(self, room, connection_id, only_addressed):
            assert room == "private-engineering-room"
            try:
                yield rooms[self.index]
            finally:
                closed.append(self.index)

    runtime.clients = {name: Client(i) for i, name in enumerate(module.ROLES)}

    async def process(cluster):
        processing.set()
        await asyncio.Event().wait()  # A slow external model or sandbox operation.

    async def handle(request):
        if request.url.path == "/api/engineering/work":
            return httpx.Response(200, json={"clusters": [{"id": "R2R-0002"}]})
        assert request.url.path == "/api/engineering/heartbeat"
        assert request.headers["Authorization"] == "Bearer private-service-key"
        await processing.wait()
        payloads.append(json.loads(request.content))
        if len(payloads) == 1:
            rooms[2].is_connected = False
            return httpx.Response(503)
        received.set()
        return httpx.Response(200, json={"ok": True})

    runtime.process = process
    async with httpx.AsyncClient(
        base_url="https://desk.example",
        transport=httpx.MockTransport(handle),
        headers={"Authorization": "Bearer private-service-key"},
    ) as http:
        runtime.api = http
        task = asyncio.create_task(runtime.run())
        try:
            await asyncio.wait_for(received.wait(), timeout=0.5)
        finally:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        count = len(payloads)
        await asyncio.sleep(0.03)
        assert len(payloads) == count  # The background heartbeat was cancelled.
    assert payloads[:2] == [
        {
            "roomsConnected": 3,
            "provider": "meta",
            "model": "muse-spark-1.3",
            "version": "1.1.0",
        },
        {
            "roomsConnected": 2,
            "provider": "meta",
            "model": "muse-spark-1.3",
            "version": "1.1.0",
        },
    ]
    assert sorted(closed) == [0, 1, 2, 3]
