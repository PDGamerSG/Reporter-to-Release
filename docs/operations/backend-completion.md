# Backend completion design

This extends the November 7 web-first release. Frontend and AI-triage work can proceed independently; these changes preserve their contracts.

The AWS engineering service uses Bedrock through the EC2 role. A successful invocation of `qwen.qwen3-coder-30b-a3b-v1:0` in `us-east-1` established access; catalog listings alone did not. Other probed providers were unavailable, so no multiple-provider execution is claimed.

The manager, reproducer, fixer, and reviewer have separate Switch identities. Work is restricted to ShopLite's calculation module and a per-bug regression test. Sanitized work snapshots exclude reporter identities, tracking capabilities, routes, and raw hashes. A separate engineering bearer can read work, record engineering actions, and leave operational notes; it cannot confirm reports, approve, merge, or record deployment.

Generated code executes in a disposable Node container with no network, credentials, metadata access, Linux capabilities, or repository history. The orchestrator holds the Docker socket and GitHub credential; generated code has neither. Models return bounded JSON file edits rather than shell commands. Path, symlink, output, runtime, memory, process, and call limits apply. A failing assertion is independently reviewed before asking the reporter. Fixes require the original reporter's confirmation, a passing regression, the existing unit suite, and an advisory model review. The service opens a draft PR; a human reviews and merges it.

The production recorder waits for Vercel's exact full commit SHA, project, production target, and READY state. It checks the immutable deployment's health, the custom hostname's alias binding, and its health before publishing GitHub deployment success. CI success alone is insufficient. A signed GitHub webhook then supplies evidence to the existing release relay.

Acceptance: boundary and sandbox tests pass; a real AWS model generates a failing regression; the original acceptance reporter confirms it; the runtime generates a passing fix and a real draft PR; production evidence is recorded automatically for a real READY revision. Telegram and Slack remain deferred. Human approval and final customer verification remain human actions.
