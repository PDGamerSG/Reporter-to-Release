"""Deploy isolated AWS engineering runtimes through a private SSM payload.

Secrets stay out of command arguments and output. The GitHub credential is
confined to trusted orchestration; sandbox containers receive no credentials.
"""

import argparse
import base64
import io
import json
import shlex
import subprocess
import tarfile
import tempfile
import uuid
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--region", default="ap-southeast-2")
    parser.add_argument("--app-url", required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    values = {}
    for line in (root / ".env.local").read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            key, value = line.split("=", 1)
            values[key] = shlex.split(value)[0] if value else ""
    for key in ["ENGINEERING_TOKEN", "GITHUB_TOKEN", "MODEL_API_KEY"]:
        if not values.get(key):
            raise SystemExit(f"Configure {key} privately before deployment.")
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for relative in [
            "worker",
            "scripts/bootstrap-switch.py",
            "scripts/bind-switch-identity.py",
            "infra/engineering.compose.yml",
            "infra/engineering-sandbox.Dockerfile",
            "infra/run-regression.sh",
            "infra/format-source.mjs",
            "package.json",
            "package-lock.json",
        ]:
            archive.add(
                root / relative,
                arcname=relative,
                filter=lambda m: (
                    None
                    if any(
                        part in {".venv", "__pycache__", ".pytest_cache", ".ruff_cache"}
                        for part in Path(m.name).parts
                    )
                    else m
                ),
            )
    account = subprocess.run(
        ["aws", "sts", "get-caller-identity", "--query", "Account", "--output", "text"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    bucket = f"r2r-deployment-{account}-{args.region}"
    checked = subprocess.run(
        ["aws", "s3api", "head-bucket", "--bucket", bucket],
        capture_output=True,
        check=False,
    )
    if checked.returncode:
        subprocess.run(
            [
                "aws",
                "s3api",
                "create-bucket",
                "--bucket",
                bucket,
                "--region",
                args.region,
                "--create-bucket-configuration",
                f"LocationConstraint={args.region}",
            ],
            capture_output=True,
            check=True,
        )
    subprocess.run(
        [
            "aws",
            "s3api",
            "put-public-access-block",
            "--bucket",
            bucket,
            "--public-access-block-configuration",
            "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
        ],
        capture_output=True,
        check=True,
    )
    lifecycle = json.dumps(
        {
            "Rules": [
                {
                    "ID": "ExpireDeploymentArchives",
                    "Status": "Enabled",
                    "Filter": {"Prefix": "engineering/"},
                    "Expiration": {"Days": 1},
                }
            ]
        }
    )
    subprocess.run(
        [
            "aws",
            "s3api",
            "put-bucket-lifecycle-configuration",
            "--bucket",
            bucket,
            "--lifecycle-configuration",
            lifecycle,
        ],
        capture_output=True,
        check=True,
    )
    key = "engineering/" + uuid.uuid4().hex + ".tar.gz"
    with tempfile.NamedTemporaryFile(suffix=".tar.gz") as package_file:
        package_file.write(buffer.getvalue())
        package_file.flush()
        subprocess.run(
            [
                "aws",
                "s3api",
                "put-object",
                "--bucket",
                bucket,
                "--key",
                key,
                "--body",
                package_file.name,
                "--server-side-encryption",
                "AES256",
                "--region",
                args.region,
            ],
            capture_output=True,
            check=True,
        )
    package_url = subprocess.run(
        [
            "aws",
            "s3",
            "presign",
            f"s3://{bucket}/{key}",
            "--region",
            args.region,
            "--expires-in",
            "900",
        ],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    env = {
        "APP_URL": args.app_url.rstrip("/"),
        "ENGINEERING_TOKEN": values["ENGINEERING_TOKEN"],
        "GITHUB_TOKEN": values["GITHUB_TOKEN"],
        "MODEL_API_KEY": values["MODEL_API_KEY"],
        "GITHUB_REPOSITORY": "PDGamerSG/Reporter-to-Release",
        "BEDROCK_REGION": "us-east-1",
        "BEDROCK_MODEL_ID": "qwen.qwen3-coder-30b-a3b-v1:0",
        "ENGINEERING_DAILY_MODEL_CALLS": "20",
        "ENGINEERING_MODEL_PROVIDER": "meta",
    }
    private = base64.b64encode(
        "".join(f"{k}={v}\n" for k, v in env.items()).encode()
    ).decode()
    script = "\n".join(
        [
            "set -eu",
            "umask 077",
            "cd /opt/r2r",
            "curl --fail --silent --show-error "
            + shlex.quote(package_url)
            + " -o /tmp/r2r-engineering.tar.gz",
            "tar xzf /tmp/r2r-engineering.tar.gz && rm /tmp/r2r-engineering.tar.gz",
            "printf '%s' '" + private + "' | base64 -d > engineering.env",
            "python3 scripts/bootstrap-switch.py",
            "mkdir -p engineering-state && chmod 700 engineering-state",
            "docker build -f infra/engineering-sandbox.Dockerfile -t r2r-regression:current .",
            "docker compose -f compose.yml -f override.yml -f infra/worker.compose.yml -f infra/engineering.compose.yml up -d --build engineering",
            "docker exec -i r2r-engineering-1 python -m r2r_engineering.identity < switch-credentials.json > manager-transport.json",
            "python3 scripts/bind-switch-identity.py",
            "docker compose -f compose.yml -f override.yml -f infra/worker.compose.yml -f infra/engineering.compose.yml up -d --build worker",
        ]
    )
    payload = {
        "DocumentName": "AWS-RunShellScript",
        "InstanceIds": [args.instance_id],
        "Comment": "Deploy isolated Reporter-to-Release engineering runtimes",
        "Parameters": {"commands": [script], "executionTimeout": ["900"]},
    }
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as private_file:
        json.dump(payload, private_file)
        private_file.flush()
        result = subprocess.run(
            [
                "aws",
                "ssm",
                "send-command",
                "--region",
                args.region,
                "--cli-input-json",
                "file://" + private_file.name,
                "--query",
                "Command.CommandId",
                "--output",
                "text",
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    if result.returncode:
        detail = (
            result.stderr.replace(script, "<private deployment>")
            .replace(package_url, "<private archive URL>")
            .replace(private, "<private environment>")
        )
        for value in env.values():
            if len(value) >= 24:
                detail = detail.replace(value, "<redacted>")
        raise SystemExit(
            "AWS rejected the engineering deployment request: " + detail[:450]
        )
    print("Engineering deployment command:", result.stdout.strip())


if __name__ == "__main__":
    main()
