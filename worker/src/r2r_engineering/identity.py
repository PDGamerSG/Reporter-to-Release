"""Bind the manager's registered identity to its authenticated native event.

Run on the trusted host with registration state on stdin. This private protocol
probe sends no ledger action and makes no model call. Credentials never print.
"""

import asyncio
import json
import os
import re
import sys
import uuid

from switchkit import AgentCredentials, SwitchClient

from r2r_engineering.runtime import handoff_matches


async def probe(state):
    clients = {
        role: SwitchClient(
            os.environ["SWITCH_URL"],
            AgentCredentials(
                state["vulcan-" + role]["id"],
                state["vulcan-" + role]["api_key"],
            ),
        )
        for role in ["manager", "reproducer"]
    }
    nonce = uuid.uuid4().hex
    room = state.get("identity_probe_room")
    if not room:
        created = await clients["manager"].op(
            "create_room",
            {
                "name": "Vulcan transport verification",
                "description": "Private receipt-based identity probe; no ledger actions or model calls.",
                "agent_names": ["vulcan-manager", "vulcan-reproducer"],
                "internal_only": True,
                "include_owner": True,
            },
        )
        room = created.get("room_id") or created.get("id")
        if not isinstance(room, str) or not room:
            raise ValueError("Switch did not return the private probe room.")
    task = "/r2r-identity-probe " + nonce
    async with (
        clients["manager"].connect(
            room, "identity-manager-" + nonce, only_addressed=True
        ) as manager,
        clients["reproducer"].connect(
            room, "identity-reproducer-" + nonce, only_addressed=True
        ) as receiver,
    ):
        delivery = await manager.send_targeted_message(
            task, target_names=["vulcan-reproducer"]
        )

        async def receive():
            async for message in receiver.messages():
                if handoff_matches(
                    message, delivery.get("event_id"), "vulcan-reproducer", task
                ):
                    sender = message.sender
                    if not isinstance(sender, str) or not re.fullmatch(
                        r"@switch-agent-[\w-]+:[\w.-]+", sender
                    ):
                        raise ValueError(
                            "Switch returned an invalid transport identity."
                        )
                    return {
                        "managerId": state["vulcan-manager"]["id"],
                        "transportSender": sender,
                        "probeRoomId": room,
                    }
            raise ValueError("The authenticated identity probe ended before receipt.")

        return await asyncio.wait_for(receive(), timeout=25)


def main():
    state = json.load(sys.stdin)
    print(json.dumps(asyncio.run(probe(state))))


if __name__ == "__main__":
    main()
