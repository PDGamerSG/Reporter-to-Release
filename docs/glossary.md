# Glossary

| Term                | Meaning                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Airlock             | Redaction, instruction detection, and quarantine before a report crosses into engineering.                                     |
| Dossier             | Structured report facts: title, component, severity, steps, expected and actual behavior, environment, and safety annotations. |
| Cluster             | One bug and its affected reports, shared evidence, review, and release state.                                                  |
| Capability link     | A private tracking URL whose secret fragment authorizes one report's read and confirmation actions.                            |
| Concierge           | The Python service that relays safe facts and reporter updates between the ledger and Switch rooms.                            |
| Engineering runtime | An authenticated model provider process connected to a Switch agent identity. A registered identity alone is not a runtime.    |
| Outbox              | Durable delivery jobs written with workflow state and delivered later by the worker.                                           |
| Lease               | Temporary ownership of an outbox job, checked during acknowledgement.                                                          |
| Compare-and-swap    | Write a new ledger version only if nobody has changed the version since it was read.                                           |
| Verified            | A production release has been confirmed by a reporter. Another affected reporter can still reject it and reopen the bug.       |

Sources: [domain types](../src/lib/domain/types.ts), [workflow](../src/lib/domain/workflow.ts), [outbox](../src/lib/domain/outbox.ts), [worker](../worker/src/r2r_worker/main.py).
