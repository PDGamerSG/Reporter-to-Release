"""Run with R2R_SANDBOX_TESTS=1 after building r2r-regression:current."""

import os
import shutil
from pathlib import Path

import pytest
from r2r_engineering.sandbox import DockerSandbox, apply_files, is_assertion_failure

pytestmark = pytest.mark.skipif(
    os.environ.get("R2R_SANDBOX_TESTS") != "1",
    reason="Requires the built Docker regression image",
)


def snapshot(tmp_path):
    tmp_path.chmod(0o755)
    repository = Path(__file__).resolve().parents[2]
    for name in [
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vitest.config.ts",
    ]:
        shutil.copy(repository / name, tmp_path / name)
    (tmp_path / "src/lib").mkdir(parents=True)
    (tmp_path / "tests").mkdir()
    (tmp_path / "scripts").mkdir()
    return tmp_path


def test_sandbox_measures_a_real_failing_then_passing_assertion(tmp_path):
    root = snapshot(tmp_path)
    test = "tests/sandbox.test.ts"
    apply_files(
        root,
        {
            test: "import {it,expect} from 'vitest'; import {calculateTotal} from '@/lib/shoplite'; it('clamps a negative payable amount',()=>expect(calculateTotal()).toBe(0));",
            "src/lib/shoplite.ts": "export function calculateTotal(){return -100;}",
        },
        {test, "src/lib/shoplite.ts"},
    )
    sandbox = DockerSandbox()
    failing = sandbox.run(root, [test])
    assert is_assertion_failure(failing), failing["output"]
    apply_files(
        root,
        {
            "src/lib/shoplite.ts": "export function calculateTotal(){return Math.max(0,-100);}"
        },
        {"src/lib/shoplite.ts"},
    )
    passing = sandbox.run(root, [test])
    assert passing["exitCode"] == 0, passing["output"]


def test_sandbox_cannot_read_orchestrator_credentials_socket_or_metadata(
    tmp_path, monkeypatch
):
    root = snapshot(tmp_path)
    for key in ["GITHUB_TOKEN", "ENGINEERING_TOKEN", "AWS_SECRET_ACCESS_KEY"]:
        monkeypatch.setenv(key, "private-sentinel-that-must-not-cross")
    test = "tests/isolation.test.ts"
    source = """import {it,expect} from 'vitest';
import {existsSync,writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
it('has no orchestrator privileges', async()=>{
  expect(process.getuid?.()).toBe(10001);
  for(const key of ['GITHUB_TOKEN','ENGINEERING_TOKEN','AWS_SECRET_ACCESS_KEY']) expect(process.env[key]).toBeUndefined();
  expect(existsSync('/var/run/docker.sock')).toBe(false);
  expect(()=>writeFileSync('/forbidden','x')).toThrow();
  const result=await new Promise<string>(resolve=>{
    const socket=createConnection({host:'169.254.169.254',port:80});
    socket.once('connect',()=>{socket.destroy();resolve('connected');});
    socket.once('error',(error:NodeJS.ErrnoException)=>resolve(error.code||'error'));
    socket.setTimeout(1000,()=>{socket.destroy();resolve('timeout');});
  });
  expect(['ENETUNREACH','EHOSTUNREACH','EACCES','EADDRNOTAVAIL']).toContain(result);
});"""
    apply_files(root, {test: source}, {test})
    result = DockerSandbox().run(root, [test])
    assert result["exitCode"] == 0, result["output"]
    assert "private-sentinel" not in result["output"]
