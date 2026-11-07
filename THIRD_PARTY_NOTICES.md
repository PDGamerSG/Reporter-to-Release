# Third-party notices

No license has been selected for the original Reporter-to-Release project code. The following components retain their own licenses and attribution. A dependency's license does not license this repository as a whole.

## Planning and imported protocol client

The product concept and workflow requirements come from [Hydra-Of-Malice/reporter-to-release](https://github.com/Hydra-Of-Malice/reporter-to-release), revision `87e96ca2c5c050076ca45393d6a8bcbfa58045a8`.

The generic Python files in [worker/src/switchkit](worker/src/switchkit) were imported from [Hydra-Of-Malice/switch-hackathon-research](https://github.com/Hydra-Of-Malice/switch-hackathon-research), `prototypes/s2-switchkit/src/switchkit`, inspected at revision `7458181d0f53987becc415f1bbf89ef876c78d34`. The new `is_connected` property in `connection.py` supports worker health reporting. The research repository did not provide a root license in the inspected revision; this notice attributes the source and does not assert a license grant for it.

See [event contribution and provenance](docs/EVENT_CONTRIBUTION.md) for the boundary between earlier research and the new implementation.

## Switch runtime

Switch is copyright © 2026 SB Technology, Inc. dba SandboxAQ. The deployed runtime and compose contract are pinned to [`f3f38eb54c6be0cec6f235d805e971efd15d9564`](https://github.com/sandbox-quantum/switch/tree/f3f38eb54c6be0cec6f235d805e971efd15d9564).

Its license is **Apache License 2.0 limited by a modified Commons Clause condition**, including restrictions on selling the software or derivatives. It must not be described as plain Apache-2.0. The full upstream text is preserved in [SWITCH-LICENSE.txt](docs/licenses/SWITCH-LICENSE.txt). Switch runs as a separately deployed service; the application uses its protocol and template schema.

## Application dependencies

| Component                   | Inspected version | License    | Upstream                                                              |
| --------------------------- | ----------------- | ---------- | --------------------------------------------------------------------- |
| Next.js                     | 16.4.5            | MIT        | [vercel/next.js](https://github.com/vercel/next.js)                   |
| React / React DOM           | 19.3.1            | MIT        | [facebook/react](https://github.com/facebook/react)                   |
| Neon serverless driver      | 1.2.0             | MIT        | [neondatabase/serverless](https://github.com/neondatabase/serverless) |
| Zod                         | 4.6.7             | MIT        | [colinhacks/zod](https://github.com/colinhacks/zod)                   |
| Lucide React                | 0.468.0           | ISC        | [lucide-icons/lucide](https://github.com/lucide-icons/lucide)         |
| TypeScript                  | 5.9.3             | Apache-2.0 | [microsoft/TypeScript](https://github.com/microsoft/TypeScript)       |
| Playwright                  | 1.65.0            | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright)       |
| axe-core Playwright adapter | 4.14.0            | MPL-2.0    | [dequelabs/axe-core-npm](https://github.com/dequelabs/axe-core-npm)   |
| Vitest                      | 4.1.12            | MIT        | [vitest-dev/vitest](https://github.com/vitest-dev/vitest)             |
| ESLint                      | 9.39.5            | MIT        | [eslint/eslint](https://github.com/eslint/eslint)                     |
| Prettier                    | 3.9.10            | MIT        | [prettier/prettier](https://github.com/prettier/prettier)             |

Versions and direct license identifiers were read from installed package metadata corresponding to [package-lock.json](package-lock.json). Transitive dependencies retain their own notices inside their distributed packages.

## Fonts, icons, and images

Manrope and IBM Plex Mono use the SIL Open Font License 1.1. Next.js downloads and serves selected font subsets through `next/font`. Sources: [Manrope](https://github.com/sharanda/manrope), [IBM Plex](https://github.com/IBM/plex), and [layout](src/app/layout.tsx). Lucide icons use ISC as listed above.

README screenshots capture this application's own interface. ShopLite's product illustration and interface marks are CSS/SVG created for this project; no stock photography is bundled. Screenshots intentionally use the labeled demonstration workspace rather than customer data.

The final documentation format and checker come from [Readme-pro-max](https://github.com/PDGamerSG/Readme-pro-max), revision `7981654ef073e7973961627249b5ea0ca6f0d47e`. The kit's external tools were used for documentation; its implementation is not copied into the application runtime.

## Worker dependencies and services

The Python worker uses HTTPX (BSD-3-Clause), websockets (BSD-3-Clause), and python-dotenv (BSD-3-Clause). Locked versions appear in [uv.lock](worker/uv.lock) and the exported [requirements](worker/requirements.txt); upstream package distributions carry their license texts. The hosted stack also uses Python, Postgres, Docker tooling, and Caddy under their respective upstream licenses.
