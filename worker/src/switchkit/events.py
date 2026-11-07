"""Typed views over the frames a Switch connection delivers.

A frame on the agent WebSocket is `{"event": <name>, "data": {...}, "id": <seq>}`.
`id` is present on events that belong to the stream and is what a reconnecting
client passes back as `start_from`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Event:
    name: str
    data: dict[str, Any]
    seq: int | None

    @classmethod
    def from_frame(cls, frame: dict[str, Any]) -> Event:
        return cls(
            name=str(frame.get("event", "")),
            data=frame.get("data") or {},
            seq=frame.get("id"),
        )


@dataclass(frozen=True)
class Message:
    """A room message delivered to this agent."""

    room_id: str
    message_id: str | None
    thread_id: str | None
    sender: str | None
    sender_name: str | None
    body: str
    addressed: bool
    attachments: list[dict[str, Any]] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_event(cls, event: Event) -> Message:
        data = event.data
        payload = data.get("payload") or {}
        return cls(
            room_id=str(data.get("room_id") or payload.get("room_id") or ""),
            message_id=payload.get("message_id"),
            thread_id=payload.get("thread_id"),
            sender=payload.get("sender"),
            sender_name=payload.get("sender_name"),
            body=str(payload.get("body") or ""),
            addressed=bool(payload.get("addressed")),
            attachments=list(payload.get("attachments") or []),
            raw=data,
        )
