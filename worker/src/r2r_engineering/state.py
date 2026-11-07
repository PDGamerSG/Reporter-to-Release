"""Restart-safe stage receipts and a conservative daily model-call budget."""

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path


def eligible_stage(cluster: dict):
    if cluster.get("state") in {"new", "reopened", "reproducing"}:
        return "reproduce"
    if cluster.get("state") in {"confirmed", "fixing"} and cluster.get(
        "reporterConfirmedAt"
    ):
        return "fix"
    return None


class State:
    def __init__(self, path: Path, daily_limit=40):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        path.chmod(0o600)
        self.daily_limit = daily_limit
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS stages (bug TEXT, stage TEXT, value TEXT NOT NULL, PRIMARY KEY(bug, stage))"
        )
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS calls (day TEXT PRIMARY KEY, count INTEGER NOT NULL)"
        )
        self.db.commit()

    def reserve_call(self):
        day = datetime.now(UTC).date().isoformat()
        with self.db:
            row = self.db.execute(
                "SELECT count FROM calls WHERE day=?", (day,)
            ).fetchone()
            if row and row[0] >= self.daily_limit:
                raise ValueError(
                    "The daily model-call budget is exhausted; human review is needed."
                )
            self.db.execute(
                "INSERT INTO calls VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1",
                (day,),
            )

    def load(self, bug, stage):
        row = self.db.execute(
            "SELECT value FROM stages WHERE bug=? AND stage=?", (bug, stage)
        ).fetchone()
        return json.loads(row[0]) if row else None

    def save(self, bug, stage, value):
        with self.db:
            self.db.execute(
                "INSERT INTO stages VALUES (?,?,?) ON CONFLICT(bug,stage) DO UPDATE SET value=excluded.value",
                (bug, stage, json.dumps(value)),
            )

    def delete(self, bug, stage):
        with self.db:
            self.db.execute("DELETE FROM stages WHERE bug=? AND stage=?", (bug, stage))
