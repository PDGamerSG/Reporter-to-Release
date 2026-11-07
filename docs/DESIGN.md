# Design

The desk uses a dark navigation column, cloud-white workspace, compact report rows, and a periwinkle action color. The report lifecycle stays visible above the queue. Evidence, activity, and reporter details open in native dialogs so the operator keeps the queue context.

| Token          | Value     | Role                                  |
| -------------- | --------- | ------------------------------------- |
| `--background` | `#f7f8fc` | Workspace background                  |
| `--surface`    | `#fff`    | Cards and forms                       |
| `--ink`        | `#202638` | Primary text                          |
| `--muted`      | `#62697b` | Secondary text                        |
| `--line`       | `#e9ebf2` | Dividers                              |
| `--purple`     | `#6a59df` | Primary actions and active navigation |
| `--nav`        | `#171d33` | Navigation surface                    |

Source: [global stylesheet](../src/app/globals.css). Manrope is the interface font; IBM Plex Mono identifies evidence and technical values. Next.js serves the selected font subsets locally after build. Lucide supplies the icons. Sources: [layout](../src/app/layout.tsx), [third-party notices](../THIRD_PARTY_NOTICES.md).

The navigation scrolls in short windows and becomes a drawer below 700 pixels. Mobile report rows reduce optional columns; forms stack their fields. The demo notice and mode badge remain visible so synthetic progress is identifiable.

Keyboard users can skip to main content, search with Command/Ctrl+K, open report dialogs, and dismiss them with Escape. Native dialogs trap focus and expose their headings through `aria-labelledby`. Status badges include text. Automated axe checks cover the dashboard, dialog, all workspace views, and public intake, plus desktop and mobile overflow. They do not establish complete accessibility conformance.

Sources: [dashboard](../src/components/dashboard.tsx), [UI primitives](../src/components/ui.tsx), [browser tests](../e2e/workspace.spec.ts). Reduced-motion rules disable nonessential animation in the stylesheet.

## Reporter home page

The home page is deliberately small: one input, one result, and a short note on what happens next. It has its own look, scoped in [bug-desk.module.css](../src/components/bug-desk.module.css), and the operator workspace keeps the system above.

- **Direction:** a cyanotype page with pen-drawn outlines. Prussian blue `#14307e`, line white `#eef3ff`, marker yellow `#ffd93b`, and a white result sheet `#fdfdfb`. Shantell Sans sets headings, and Manrope sets body text.
- **Mascot:** a pill bug, which rolls into a ball because that is what pill bugs do. It rolls along the progress line only while real work runs, and uncurls when the result lands. Reduced-motion users get the same steps without spinning.
- **Result:** severity always carries a text label, never color alone. Below 900 px the detail cards become a swipeable deck, and the next card peeks in to show there is more.
- **Failure:** the report is saved first, so a failed triage shows the tracking link and a retry instead of a dead end.
