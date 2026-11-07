"""switchkit: a small Python client for the Switch agent protocol."""

from switchkit.client import AgentCredentials, SwitchClient, SwitchError
from switchkit.connection import ConnectionClosed, RoomConnection
from switchkit.events import Event, Message

__all__ = [
    "AgentCredentials",
    "ConnectionClosed",
    "Event",
    "Message",
    "RoomConnection",
    "SwitchClient",
    "SwitchError",
]
