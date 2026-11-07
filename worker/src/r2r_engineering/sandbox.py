"""Only bounded file edits and fixed, networkless regression commands are allowed."""

import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

SOURCE_PATH = "src/lib/shoplite.ts"


def regression_path(bug):
    if not re.fullmatch(r"R2R-\d{4,}", bug):
        raise ValueError("Invalid bug identifier.")
    return "tests/agent-" + bug.lower() + ".test.ts"


def apply_files(root: Path, files: dict, allowed: set[str]):
    if not isinstance(files, dict) or not files or len(files) > 2:
        raise ValueError("One or two bounded file edits are required.")
    for name, content in files.items():
        if (
            name not in allowed
            or not isinstance(content, str)
            or not 1 <= len(content) <= 24_000
        ):
            raise ValueError("A generated edit is outside the allowed boundary.")
        target = root / name
        for parent in [target, *target.parents]:
            if parent == root.parent:
                break
            if parent.is_symlink():
                raise ValueError("Generated edits cannot follow symlinks.")
        if not target.resolve().is_relative_to(root.resolve()):
            raise ValueError("Generated edits cannot escape the workspace.")
    for name, content in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)


class DockerSandbox:
    def __init__(self, image="r2r-regression:current", timeout=120):
        self.image = image
        self.timeout = timeout

    def run(self, root: Path, paths=()):
        if any(not re.fullmatch(r"tests/[\w.-]+\.test\.ts", path) for path in paths):
            raise ValueError("Only repository regression tests can execute.")
        return self._execute(root, paths)

    def format(self, root: Path, paths):
        result = self._quality(root, paths, "format")
        if result["exitCode"] != 0:
            raise ValueError("The trusted source formatter failed.")
        files = json.loads(result["output"])
        if set(files) != set(paths):
            raise ValueError("The formatter returned unexpected paths.")
        return files

    def validate(self, root: Path, paths):
        return self._quality(root, paths, "validate")

    def _quality(self, root, paths, operation):
        if not paths or any(
            path != SOURCE_PATH and not re.fullmatch(r"tests/[\w.-]+\.test\.ts", path)
            for path in paths
        ):
            raise ValueError("Quality checks are restricted to the measured patch.")
        return self._execute(
            root,
            ["--" + operation, *paths],
            large_output=operation == "format",
            memory="768m" if operation == "validate" else "384m",
        )

    def _execute(self, root, paths, large_output=False, memory="384m"):
        name = "r2r-test-" + uuid.uuid4().hex
        args = [
            "docker",
            "run",
            "--rm",
            "--name",
            name,
            "--network",
            "none",
            "--read-only",
            "--cap-drop",
            "ALL",
            "--security-opt",
            "no-new-privileges",
            "--user",
            "10001:10001",
            "--memory",
            memory,
            "--cpus",
            "0.75",
            "--pids-limit",
            "96",
            "--tmpfs",
            "/tmp:size=64m,uid=10001,gid=10001",
            "--tmpfs",
            "/work:size=256m,uid=10001,gid=10001",
            "--mount",
            f"type=bind,source={root.resolve()},target=/snapshot,readonly",
            self.image,
            *paths,
        ]
        with tempfile.TemporaryFile() as output:
            process = subprocess.Popen(
                args,
                stdout=output,
                stderr=subprocess.STDOUT,
                env={"PATH": os.environ.get("PATH", "/usr/bin:/bin")},
            )
            deadline = time.monotonic() + self.timeout
            limited = False
            while process.poll() is None:
                if (
                    time.monotonic() >= deadline
                    or os.fstat(output.fileno()).st_size > 256_000
                ):
                    subprocess.run(
                        ["docker", "rm", "-f", name],
                        capture_output=True,
                        timeout=15,
                        check=False,
                    )
                    process.kill()
                    limited = True
                    break
                time.sleep(0.15)
            process.wait(timeout=15)
            output.seek(0)
            text = output.read(90_000 if large_output else 24_000).decode(
                errors="replace"
            )
            if not large_output:
                text = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", text)[:12_000]
        return {
            "exitCode": process.returncode if not limited else 124,
            "output": text,
            "limited": limited,
        }


def is_assertion_failure(result):
    return (
        result["exitCode"] == 1
        and not result["limited"]
        and "AssertionError" in result["output"]
        and "Test Files" in result["output"]
    )
