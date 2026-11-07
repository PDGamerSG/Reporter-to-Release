"""The WebSocket side of the Switch agent protocol, one connection per room.

One room per connection because room-scoped operations (post_message,
send_targeted_message, ...) act on the connection's single room; a connection
covering several rooms makes them fail.

Heartbeat: the server sends `{"event": "ping"}` every couple of seconds and
evicts a connection that has not answered `{"type": "pong", "cursor": N}`
within about six. Pings are answered by a reader task, so slow event handling
never costs the connection.

Reconnects reuse the same connection id and resume from the cursor. The
server's `taken_over` refusal is final: another client now holds the
connection, so this one stops instead of fighting it.
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode

import websockets
from websockets.asyncio.client import ClientConnection
from websockets.exceptions import ConnectionClosed as WsConnectionClosed

from switchkit.events import Event, Message

if TYPE_CHECKING:
    from switchkit.client import SwitchClient

logger = logging.getLogger("switchkit")

CONTROL_EVENTS = frozenset({"ping"})
FINAL_REFUSALS = frozenset({"taken_over"})


class ConnectionClosed(RuntimeError):
    """The connection ended for good (refused, taken over, or closed)."""


class RoomConnection:
    @property
    def is_connected(self) -> bool:
        return self._ws is not None and self._ws.state.name == "OPEN"

    def __init__(
        self,
        client: SwitchClient,
        room_id: str,
        connection_id: str,
        only_addressed: bool,
    ) -> None:
        self.client = client
        self.room_id = room_id
        self.connection_id = connection_id
        self.only_addressed = only_addressed
        self.cursor: int | None = None
        self.state: dict[str, Any] = {}
        self._queue: asyncio.Queue[Event | BaseException] = asyncio.Queue()
        self._runner: asyncio.Task[None] | None = None
        self._ws: ClientConnection | None = None
        self._ready = asyncio.Event()
        self._closing = False

    def _url(self) -> str:
        base = self.client.base_url.replace("https://", "wss://").replace("http://", "ws://")
        params: dict[str, str] = {
            "connection_id": self.connection_id,
            "rooms": self.room_id,
            "scope": "single",
            "filter": "addressed" if self.only_addressed else "all",
            "start_from": "head" if self.cursor is None else str(self.cursor),
            "client": "switchkit",
            "client_version": "0.1.0",
        }
        return f"{base}/agents/{self.client.agent_id}/connection/ws?{urlencode(params)}"

    async def start(self) -> RoomConnection:
        """Open the socket and wait for the server's `connection_state`."""
        self._runner = asyncio.create_task(self._run(), name=f"switchkit:{self.room_id}")
        ready = asyncio.create_task(self._ready.wait())
        done, _ = await asyncio.wait({ready, self._runner}, return_when=asyncio.FIRST_COMPLETED)
        if self._runner in done:
            ready.cancel()
            self._runner.result()
            raise ConnectionClosed("connection ended before it was established")
        return self

    async def close(self) -> None:
        self._closing = True
        if self._ws is not None:
            await self._ws.close()
        if self._runner is not None:
            self._runner.cancel()
            await asyncio.gather(self._runner, return_exceptions=True)

    async def __aenter__(self) -> RoomConnection:
        return await self.start()

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def _run(self) -> None:
        backoff = 0.5
        headers = {"Authorization": f"Bearer {self.client.credentials.api_key}"}
        while not self._closing:
            try:
                async with websockets.connect(self._url(), additional_headers=headers) as ws:
                    self._ws = ws
                    backoff = 0.5
                    await self._read(ws)
            except ConnectionClosed as final:
                await self._queue.put(final)
                return
            except (OSError, WsConnectionClosed) as exc:
                if self._closing:
                    return
                code = getattr(getattr(exc, "rcvd", None), "code", None)
                if code is not None and 4400 <= code < 4500 and code not in (4404, 4409):
                    await self._queue.put(ConnectionClosed(f"refused with close code {code}"))
                    return
                logger.warning("switchkit: connection to room %s dropped (%s); reconnecting", self.room_id, exc)
            await asyncio.sleep(backoff + random.uniform(0, backoff / 2))
            backoff = min(backoff * 2, 15.0)

    async def _read(self, ws: ClientConnection) -> None:
        async for raw in ws:
            frame = json.loads(raw)
            event = Event.from_frame(frame)
            if event.name == "ping":
                await ws.send(json.dumps({"type": "pong", "cursor": self.cursor or 0}))
                continue
            if event.name == "refused":
                if event.data.get("status") in (400, 401, 403, 422):
                    raise ConnectionClosed(f"refused: {event.data}")
                logger.warning("switchkit: room %s refused for now (%s); retrying", self.room_id, event.data)
                return
            if event.name == "evicted":
                code = event.data.get("code")
                if code in FINAL_REFUSALS:
                    raise ConnectionClosed(f"evicted: {event.data}")
                logger.warning("switchkit: evicted from room %s (%s); reconnecting", self.room_id, event.data)
                return
            if event.name == "connection_state":
                self.state = event.data
                if self.cursor is None and isinstance(event.data.get("cursor"), int):
                    self.cursor = event.data["cursor"]
                self._ready.set()
                continue
            if event.seq is not None:
                self.cursor = event.seq
            await self._queue.put(event)

    async def events(self) -> AsyncIterator[Event]:
        """Every non-control event, in order. Raises ConnectionClosed at the end."""
        while True:
            item = await self._queue.get()
            if isinstance(item, BaseException):
                raise item
            yield item

    async def messages(self) -> AsyncIterator[Message]:
        """Room messages only (addressed ones, unless the connection takes all)."""
        async for event in self.events():
            if event.name == "message":
                yield Message.from_event(event)

    async def post_message(self, body: str, thread_id: str | None = None) -> dict[str, Any]:
        args: dict[str, Any] = {"body": body}
        if thread_id is not None:
            args["thread_id"] = thread_id
        return await self.client.op("post_message", args, connection_id=self.connection_id)

    async def send_targeted_message(
        self,
        body: str,
        target_names: list[str] | None = None,
        target_roles: list[str] | None = None,
        thread_id: str | None = None,
    ) -> dict[str, Any]:
        args: dict[str, Any] = {"body": body}
        if target_names:
            args["target_names"] = target_names
        if target_roles:
            args["target_roles"] = target_roles
        if thread_id is not None:
            args["thread_id"] = thread_id
        return await self.client.op("send_targeted_message", args, connection_id=self.connection_id)

    async def read_context(self, limit: int = 50) -> dict[str, Any]:
        return await self.client.op("read_context", {"limit": limit}, connection_id=self.connection_id)

    async def create_room_document(self, name: str, description: str, instructions: str, content: str) -> Any:
        return await self.client.op(
            "create_room_document",
            {"name": name, "description": description, "instructions": instructions, "content": content},
            connection_id=self.connection_id,
        )
