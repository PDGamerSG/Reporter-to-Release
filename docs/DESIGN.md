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
