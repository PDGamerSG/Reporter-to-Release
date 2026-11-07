"""HTTP side of the Switch agent protocol: registration, operations, media.

Routes (switch-core `bridges/agent/api`):
  POST /agents                                   register a custom agent
  GET  /agents/{id}/ops                          list operations
  POST /agents/{id}/ops/{name}                   call one (X-Switch-Connection-Id)
  POST /agents/{id}/message                      plain post, no connection
  POST /agents/{id}/rooms/{room}/media           upload attachments
  GET  /agents/{id}/rooms/{room}/media?mxc=...   download an attachment
"""

from __future__ import annotations

import mimetypes
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

if TYPE_CHECKING:
    from switchkit.connection import RoomConnection


class SwitchError(RuntimeError):
    """A Switch request was refused or failed."""

    def __init__(self, status: int, detail: Any, where: str) -> None:
        super().__init__(f"{where}: HTTP {status}: {detail}")
        self.status = status
        self.detail = detail


@dataclass(frozen=True)
class AgentCredentials:
    agent_id: str
    api_key: str


ALWAYS_ON_PROFILE: dict[str, Any] = {
    "connection_model": "always_on",
    "message_exchange": True,
    "pre_invocation_mediation": [],
    "post_invocation_mediation": [],
    "event_reporting": [],
}


def _raise_for(response: httpx.Response, where: str) -> None:
    if response.is_success:
        return
    try:
        detail = response.json().get("detail", response.text)
    except ValueError:
        detail = response.text
    raise SwitchError(response.status_code, detail, where)


async def register_agent(
    base_url: str,
    registration_token: str,
    name: str,
    description: str,
    connector_type: str,
    overwrite: bool,
    display_name: str | None = None,
) -> AgentCredentials:
    """Register a custom (always-on) agent. The API key is returned only once."""
    body: dict[str, Any] = {
        "name": name,
        "description": description,
        "connector_type": connector_type,
        "integration_profile": ALWAYS_ON_PROFILE,
        "overwrite": overwrite,
    }
    if display_name is not None:
        body["display_name"] = display_name
    async with httpx.AsyncClient(base_url=base_url, timeout=30) as http:
        response = await http.post(
            "/agents", json=body, headers={"Authorization": f"Bearer {registration_token}"}
        )
    _raise_for(response, "register_agent")
    data = response.json()
    return AgentCredentials(agent_id=data["id"], api_key=data["api_key"])


class SwitchClient:
    """One agent's HTTP client. Open room connections with `connect`."""

    def __init__(self, base_url: str, credentials: AgentCredentials) -> None:
        self.base_url = base_url.rstrip("/")
        self.credentials = credentials
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=60,
            headers={"Authorization": f"Bearer {credentials.api_key}"},
        )

    @property
    def agent_id(self) -> str:
        return self.credentials.agent_id

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> SwitchClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def operations(self) -> dict[str, Any]:
        response = await self._http.get(f"/agents/{self.agent_id}/ops")
        _raise_for(response, "operations")
        return response.json()["operations"]

    async def op(self, name: str, args: dict[str, Any], connection_id: str | None = None) -> Any:
        """Call an operation. Room-scoped ones need the room's `connection_id`."""
        headers = {"X-Switch-Connection-Id": connection_id} if connection_id else {}
        response = await self._http.post(
            f"/agents/{self.agent_id}/ops/{name}", json=args, headers=headers
        )
        _raise_for(response, f"op {name}")
        return response.json().get("result")

    async def post_plain(self, room_id: str, content: str) -> str:
        """Post without a connection (no thread, no addressing)."""
        response = await self._http.post(
            f"/agents/{self.agent_id}/message", json={"room_id": room_id, "content": content}
        )
        _raise_for(response, "post_plain")
        return str(response.json()["event_id"])

    async def send_media(
        self,
        room_id: str,
        paths: list[Path],
        caption: str | None = None,
        thread_id: str | None = None,
    ) -> dict[str, Any]:
        """Upload one or more files to a room as one message."""
        files = [
            (
                "files",
                (
                    path.name,
                    path.read_bytes(),
                    mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                ),
            )
            for path in paths
        ]
        form = {k: v for k, v in (("caption", caption), ("thread_id", thread_id)) if v is not None}
        response = await self._http.post(
            f"/agents/{self.agent_id}/rooms/{room_id}/media", files=files, data=form
        )
        _raise_for(response, "send_media")
        return response.json()

    async def download_media(self, room_id: str, mxc: str) -> bytes:
        response = await self._http.get(
            f"/agents/{self.agent_id}/rooms/{room_id}/media", params={"mxc": mxc}
        )
        _raise_for(response, "download_media")
        return response.content

    def connect(self, room_id: str, connection_id: str, only_addressed: bool = True) -> RoomConnection:
        """A connection to one room. Reuse the same `connection_id` across restarts."""
        from switchkit.connection import RoomConnection

        return RoomConnection(
            client=self,
            room_id=room_id,
            connection_id=connection_id,
            only_addressed=only_addressed,
        )
