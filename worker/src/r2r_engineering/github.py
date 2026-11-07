"""Publish a bounded patch as a draft PR without merge or approval operations."""

import hashlib
import re


class GitHubPublisher:
    def __init__(self, repository, http):
        if not re.fullmatch(r"[\w.-]+/[\w.-]+", repository):
            raise ValueError("Invalid repository.")
        self.repository = repository
        self.http = http

    async def request(self, method, path, body=None):
        response = await self.http.request(
            method, f"/repos/{self.repository}" + path, json=body
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json()

    async def publish(self, bug, base, files, tests, review, generation=""):
        from r2r_engineering.sandbox import SOURCE_PATH, regression_path

        if not re.fullmatch(r"[a-f0-9]{40}", base):
            raise ValueError("A full base commit is required.")
        allowed = {SOURCE_PATH, regression_path(bug)}
        if not files or not set(files).issubset(allowed):
            raise ValueError("The patch is outside the allowed repository boundary.")
        branch = f"r2r/{bug.lower()}-{base[:7]}"
        if generation:
            if not re.fullmatch(r"[a-f0-9]{32}", generation):
                raise ValueError("Invalid reproduction round.")
            branch += "-" + generation[:8]
        ref = await self.request("GET", "/git/ref/heads/" + branch)
        head = ref["object"]["sha"] if ref else None
        if head:
            comparison = await self.request("GET", f"/compare/{base}...{head}")
            if (
                not comparison
                or comparison.get("status") != "ahead"
                or comparison.get("merge_base_commit", {}).get("sha") != base
                or {entry["filename"] for entry in comparison.get("files", [])}
                != set(files)
            ):
                raise ValueError(
                    "The existing branch differs from the tested patch or base."
                )
            for name, content in files.items():
                response = await self.http.get(
                    f"/repos/{self.repository}/contents/{name}", params={"ref": head}
                )
                response.raise_for_status()
                entry = response.json()
                raw = content.encode()
                expected = hashlib.sha1(
                    f"blob {len(raw)}\0".encode() + raw, usedforsecurity=False
                ).hexdigest()
                if entry.get("type") != "file" or entry.get("sha") != expected:
                    raise ValueError(
                        "The existing branch differs from the tested patch; a human must reconcile it."
                    )
        if not head:
            parent = await self.request("GET", "/git/commits/" + base)
            tree = []
            for name, content in files.items():
                blob = await self.request(
                    "POST", "/git/blobs", {"content": content, "encoding": "utf-8"}
                )
                tree.append(
                    {"path": name, "mode": "100644", "type": "blob", "sha": blob["sha"]}
                )
            new_tree = await self.request(
                "POST", "/git/trees", {"base_tree": parent["tree"]["sha"], "tree": tree}
            )
            commit = await self.request(
                "POST",
                "/git/commits",
                {
                    "message": f"fix: address {bug} with a verified regression",
                    "tree": new_tree["sha"],
                    "parents": [base],
                    "author": {
                        "name": "Vulcan Engineering Bot",
                        "email": "engineering@users.noreply.github.com",
                    },
                },
            )
            head = commit["sha"]
            await self.request(
                "POST", "/git/refs", {"ref": "refs/heads/" + branch, "sha": head}
            )
        response = await self.http.get(
            f"/repos/{self.repository}/pulls",
            params={
                "state": "open",
                "head": self.repository.split("/")[0] + ":" + branch,
                "base": "main",
            },
        )
        response.raise_for_status()
        existing = response.json()
        if existing:
            pr = existing[0]
            if pr["head"]["sha"] != head or not pr.get("draft"):
                raise ValueError("The existing PR changed; a human must reconcile it.")
        else:
            pr = await self.request(
                "POST",
                "/pulls",
                {
                    "title": f"[{bug}] Fix confirmed ShopLite regression",
                    "head": branch,
                    "base": "main",
                    "draft": True,
                    "body": f"A reporter confirmed the failing reproduction for {bug}. The AWS engineering runtime generated this bounded patch.\n\n## Validation\n\n```text\n{tests[:7000]}\n```\n\n## Advisory model review\n\n{review[:2000]}\n\nGenerated code ran in a networkless, credential-free container. This model review is not a human approval. Human review and merge are required; only verified production evidence can notify the reporter.",
                },
            )
        return {"prUrl": pr["html_url"], "prNumber": pr["number"], "headSha": head}
