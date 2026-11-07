"""Package this checkout and deploy the worker through AWS Systems Manager.

Requires AWS CLI authentication and WORKER_TOKEN in the private .env.local file.
No SSH port, repository credential, or registration key is sent to the worker.
"""

import argparse
import base64
import io
import json
import shlex
import subprocess
import tarfile
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--region", default="ap-southeast-2")
    parser.add_argument("--app-url", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    local_env = {}
    for line in (root / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            local_env[key] = shlex.split(value)[0] if value else ""
    token = local_env.get("WORKER_TOKEN")
    if not token or len(token) < 32:
        raise SystemExit(
            "A private WORKER_TOKEN of at least 32 characters is required."
        )
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for relative in [
            "worker/Dockerfile",
            "worker/pyproject.toml",
            "worker/uv.lock",
            "worker/requirements.txt",
            "worker/src",
            "scripts/bootstrap-switch.py",
            "infra/worker.compose.yml",
        ]:
            archive.add(
                root / relative,
                arcname=relative,
                filter=lambda member: None if "__pycache__" in member.name else member,
            )
    package = base64.b64encode(buffer.getvalue()).decode()
    private_env = base64.b64encode(
        (
            f"APP_URL={args.app_url.rstrip('/')}\nWORKER_TOKEN={token}\n"
            + (
                f"TELEGRAM_BOT_TOKEN={local_env['TELEGRAM_BOT_TOKEN']}\n"
                if local_env.get("TELEGRAM_BOT_TOKEN")
                else ""
            )
        ).encode()
    ).decode()
    script = "\n".join(
        [
            "set -eu",
            "umask 077",
            "cd /opt/r2r",
            "printf '%s' '" + package + "' | base64 -d | tar xz",
            "printf '%s' '" + private_env + "' | base64 -d > worker.env",
            "python3 scripts/bootstrap-switch.py",
            "mkdir -p worker-state && chown 10001:10001 worker-state",
            "if ! docker buildx version 2>/dev/null | grep -q v0.29.1; then mkdir -p /usr/local/lib/docker/cli-plugins; curl --fail --silent --show-error --location 'https://github.com/docker/buildx/releases/download/v0.29.1/buildx-v0.29.1.linux-amd64' -o /usr/local/lib/docker/cli-plugins/docker-buildx; printf '%s  %s\\n' '7d2d7d6d4680aa349614965aaa33ccec43f1a9a21e908a5ce4cb6adfa5ad5141' '/usr/local/lib/docker/cli-plugins/docker-buildx' | sha256sum -c -; chmod 755 /usr/local/lib/docker/cli-plugins/docker-buildx; fi",
            "docker compose -f compose.yml -f override.yml -f infra/worker.compose.yml up -d --build worker",
            "docker compose -f compose.yml -f override.yml restart caddy",
        ]
    )
    payload = {
        "DocumentName": "AWS-RunShellScript",
        "InstanceIds": [args.instance_id],
        "Comment": "Deploy Reporter-to-Release worker",
        "Parameters": {"commands": [script], "executionTimeout": ["600"]},
    }
    # Keep private values out of terminal output and process arguments.
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as private:
        json.dump(payload, private)
        private.flush()
        result = subprocess.run(
            [
                "aws",
                "ssm",
                "send-command",
                "--region",
                args.region,
                "--cli-input-json",
                "file://" + private.name,
                "--query",
                "Command.CommandId",
                "--output",
                "text",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    if result.returncode:
        raise SystemExit(
            "AWS rejected the deployment request; inspect account access and SSM connectivity."
        )
    print("Deployment command:", result.stdout.strip())


if __name__ == "__main__":
    main()
