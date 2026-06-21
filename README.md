# ga4

> Check a GA4 property's recent traffic (users, sessions, pageviews) from the terminal. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/ga4/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/ga4/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`ga4` answers "how much traffic did my site get this week?" without opening the
Google Analytics UI:

```console
$ ga4 --property 123456789
# GA4 property 123456789 — last 7 days

## Totals
- Users: 4,210
- Sessions: 5,980
- Pageviews: 16,540
- New users: 3,120

## Daily
| Date | Users | Sessions | Pageviews | New users |
| --- | ---: | ---: | ---: | ---: |
| 2026-06-15 | 612 | 870 | 2,410 | 450 |
| ...
```

It authenticates with a Google service account (a signed JWT exchanged for an
access token, all via Node's built-in `crypto`), calls the GA4 Data API, and
prints a Markdown or JSON digest. No runtime dependencies.

## Requirements

- Node.js >= 20
- A Google service account with read access to your GA4 property (one-time
  setup below)

## One-time setup

1. In Google Cloud, create a service account and download its JSON key.
2. Enable the Google Analytics Data API for that project.
3. In GA4: Admin -> Property access management -> add the service account's
   email (`...@...iam.gserviceaccount.com`) as a Viewer.
4. Find your numeric property id in GA4: Admin -> Property settings (a number
   like `123456789`, not the `G-XXXXXXXX` measurement id).

## Install

Not published to npm yet — install from source:

```bash
git clone https://github.com/printemps-tokyo/ga4
cd ga4
npm install && npm run build
npm link   # optional: puts the `ga4` command on your PATH
```

## Usage

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
ga4 --property 123456789                 # last 7 days
ga4 --property 123456789 --days 30 --top 10
ga4 --property 123456789 --format json -o week.json
GA_PROPERTY_ID=123456789 ga4             # property via env
```

| Option | Description | Default |
| --- | --- | --- |
| `--property <id>` | GA4 numeric property id (or `GA_PROPERTY_ID`) | required |
| `--days <n>` | Trailing days to report | `7` |
| `--metrics <list>` | Comma list of GA4 metric names | `totalUsers,sessions,screenPageViews,newUsers` |
| `--top <n>` | Also list the top n pages by pageviews | off |
| `--key-file <path>` | Service-account JSON key (or `GOOGLE_APPLICATION_CREDENTIALS`) | — |
| `--token <token>` | Use an OAuth access token directly (or `GA_ACCESS_TOKEN`) | — |
| `--format <md\|json>` | Output format | `md` |
| `-o, --output <file>` | Write to a file | stdout |

### Authentication options

- Service account (recommended, non-interactive): point `--key-file` /
  `GOOGLE_APPLICATION_CREDENTIALS` at the JSON key. `ga4` signs a JWT and gets
  an access token itself.
- Existing token: if you already have an access token with the
  `analytics.readonly` scope (for example from `gcloud`), pass `--token` or set
  `GA_ACCESS_TOKEN`, and no key file is needed.

## Security

- The service-account key grants read access to your analytics; keep it out of
  version control and restrict its file permissions.
- `ga4` reads the key only to mint a short-lived token and never writes it
  anywhere. All requests go directly to Google's APIs.

## Programmatic API

```ts
import { buildRunReportBody, parseReport, totalsByMetric } from "@printemps-tokyo/ga4";

const body = buildRunReportBody({ days: 7, metrics: ["totalUsers"], dimensions: ["date"] });
// ...POST to the GA4 Data API with your own token...
```

The request builders, response parsers, and renderers are pure functions.

## License

[MIT](./LICENSE) (c) printemps.tokyo
