"""Persist only a receipt-proven manager transport binding from the host probe."""

import json
import os
import re
from pathlib import Path


def main():
    root = Path(os.environ.get("R2R_HOST_DIR", "/opt/r2r"))
    path = root / "switch-credentials.json"
    state = json.loads(path.read_text())
    binding = json.loads((root / "manager-transport.json").read_text())
    sender = binding.get("transportSender")
    if (
        binding.get("managerId") != state["vulcan-manager"]["id"]
        or not isinstance(sender, str)
        or len(sender) > 256
        or not re.fullmatch(r"@switch-agent-[\w-]+:[\w.-]+", sender)
    ):
        raise ValueError("The host probe did not bind the configured manager.")
    state["manager_transport_sender"] = sender
    room = binding.get("probeRoomId")
    if not isinstance(room, str) or not room or len(room) > 512:
        raise ValueError("The host probe did not identify its private room.")
    state["identity_probe_room"] = room
    path.write_text(json.dumps(state))
    path.chmod(0o600)
    worker_env = root / "worker.env"
    values = dict(
        line.split("=", 1)
        for line in worker_env.read_text().splitlines()
        if "=" in line and not line.startswith("#")
    )
    values["SWITCH_ENGINEERING_AGENT_IDS"] = sender
    worker_env.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
    worker_env.chmod(0o600)
    print("Manager transport identity bound by its authenticated Switch receipt.")


if __name__ == "__main__":
    main()
