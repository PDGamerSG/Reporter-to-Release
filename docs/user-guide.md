# User guide

## Report a bug

Open [the home page](https://reporter-to-release.pallabdas.me/). Describe what went wrong, how to repeat it, the expected result, and the browser or device involved. Submit observed behavior without passwords, customer details, or instructions for agents. In about 10 seconds the page shows AI field notes: a suggested severity, a likely cause, steps to reproduce, and the test that would prove the bug. A person makes the final decisions. If triage fails, the report is still saved and the page offers a retry. Sample reports stay out of the live desk.

Keep the **Track your report** link shown after submission. Its URL fragment contains a private capability. Anyone holding the complete link can read that report and answer its confirmation questions. The application cannot recover a lost token from its stored hash.

The tracker shows receipt, reproduction evidence, review, deployment, and reporter verification. When a reproduction card arrives, confirm only if it matches the problem you saw. After production deployment, confirm whether the fix works. A rejection reopens the cluster. Web reporters receive updates on this page; email, chat, and browser push notifications are not enabled.

Instruction-bearing reports are held in the Airlock. Their raw text is discarded. An owner must obtain clean facts before releasing the report to engineering. Detection is heuristic and does not guarantee removal of all sensitive data.

Sources: [page](../src/components/bug-desk.tsx), [tracker](../src/components/tracker.tsx), [workflow](../src/lib/domain/workflow.ts).

## Explore the demo

The [bug desk](https://reporter-to-release.pallabdas.me/desk) opens an isolated, seeded demo for each visitor. The purple demo notice identifies synthetic reports, agents, and releases. Searches, filters, dossier dialogs, reset, and example lifecycle buttons operate within that private workspace.

1. Open a bug from the inbox and inspect its dossier, evidence, activity, and reporters.
2. Submit a new report from the demo or use `/?mode=demo`.
3. Follow its example controls from reproduction to reporter confirmation, fix, human review, merge, production deployment, and final verification.
4. Use **Reset demo** in the workflow guide to restore the examples.

These controls simulate workflow facts. They do not invoke a model, run a test, create a PR, or deploy a fix. Source: [demo engine](../src/lib/demo.ts).

## Reproduce the ShopLite defect

Open [ShopLite](https://reporter-to-release.pallabdas.me/shoplite). Apply `SAVE300` to the ₹200 cart. The seeded buggy calculation shows −₹100. Select **Fixed version** to clamp the amount to ₹0. Increasing quantity changes the total using the same calculation function.

ShopLite is a sandbox with no real payment processing. Its report link enters the isolated demo. Run the actual failing and passing assertion from the command line as described in the [test plan](testing/test-plan.md).

## Operate the live desk

Select **Open live workspace** and enter the configured owner access key. The status badge changes to **Live workspace**. Use **Workspace access** and **Return to the demo** to sign out. Owner access is a shared key for this deployment; there are no individual web accounts or SSO.

| View                 | Use                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview / Bug inbox | Search, filter, and open clusters. Impact counts reflect linked reports.                                                                                 |
| Activity             | Inspect recorded workflow decisions and actor attribution.                                                                                               |
| Releases             | See production release evidence and reporter confirmation state.                                                                                         |
| Agent crew           | Read role responsibilities, access boundaries and the provider reported by AWS. The live manager is Python orchestration; demo model roles are examples. |
| Airlock              | Review held reports and replace unsafe input with clean observed facts.                                                                                  |
| Connections          | Read database, concierge and engineering heartbeats, GitHub relay, triage and deferred chat status.                                                      |
| Workflow guide       | Review the required evidence and human/reporter gates.                                                                                                   |

Record reproduction and fix evidence in the dossier dialog. The ledger requires the original reporter's confirmation before fixing and human review before a signed merge can advance it. A successful signed production deployment containing that merge unlocks release verification. Owner buttons cannot impersonate the live GitHub merge/deployment relay.

Use **Refresh workspace** to load current activity and connection status. Engineering is connected only when all four role connections are open and its heartbeat is less than 90 seconds old. A connected service can still reach its model budget or fail an inference; inspect the bug's activity for the actual outcome.

**Current operating limit:** the AWS service supports the normal ShopLite calculation module and its per-bug regression. It has produced a measured failing test and tested draft fix in a controlled live acceptance. Reports outside that scope need human investigation, and every draft fix still needs human review and merge. The active Meta API configuration needs no Switch Console provider sign-in. Chat integrations remain deferred.

Sources: [dashboard](../src/components/dashboard.tsx), [API](../src/lib/api.ts), [relay](../src/lib/integrations/github.ts).
