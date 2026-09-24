# ga4

> Check a GA4 property's recent traffic (users, sessions, pageviews) from the terminal. Zero-dependency CLI.

[![CI](https://github.com/printemps-tokyo/ga4/actions/workflows/ci.yml/badge.svg)](https://github.com/printemps-tokyo/ga4/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

`ga4` answers "how much traffic did my site get this week?" without opening the
Google Analytics UI:

```console
$ ga4 --property 123456789
# GA4 property 123456789 — last 7 complete days (excluding today)

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
   like `123456789`, not the `G-XXXXXXXX` measurement id), or run `ga4 --list`
   (step 5).
5. Optional, for `ga4 --list`: also enable the Google Analytics Admin API in
   the same project.

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
ga4 --property 123456789                 # last 7 complete days
ga4 --property 123456789 --days 30 --top 10
ga4 --property 123456789 --channels        # sessions by channel group (top 10)
ga4 --property 123456789 --channels 5      # top 5 channels only
ga4 --property 123456789 --format json -o week.json
GA_PROPERTY_ID=123456789 ga4             # property via env
ga4 --list                                 # accounts and properties you can see
ga4 --list --format json
ga4 --all --days 3                         # every property, one row each
```

`--all` goes one step further and reports every property at once:

```console
$ ga4 --all --days 3
# GA4 — all properties, last 3 complete days (excluding today)

| Account | Property | ID | Users | Sessions | Pageviews |
| --- | --- | --- | ---: | ---: | ---: |
| Example account | example.com | 123456789 | 369 | 471 | 2,240 |
| Example account | blog.example.com | 987654321 | 224 | 266 | 288 |
```

Each row is that property's own GA4 total for the range (users and sessions
deduplicated), so rows are not added up across properties.

`--list` prints every account and property the credentials can read, with
their numeric ids, through the Admin API's `accountSummaries.list`:

```console
$ ga4 --list
# GA4 accounts and properties

## Example account (123456)

| Property | ID |
| --- | --- |
| example.com | 123456789 |
| blog.example.com | 987654321 |
```

| Option | Description | Default |
| --- | --- | --- |
| `--list` | List visible accounts and properties (names and ids), then exit. Needs the Admin API enabled; cannot be combined with report options | off |
| `--all` | One row per visible property with GA4's range totals (default metrics `totalUsers,sessions,screenPageViews`; `--days`, `--metrics`, `--format`, `-o` apply). Needs the Admin API, like `--list`. Exits 1 if any property fails, after printing the rest | off |
| `--property <id>` | GA4 numeric property id (or `GA_PROPERTY_ID`) | required (except with `--list` / `--all`) |
| `--days <n>` | Trailing complete days to report (`--days 7` covers the 7 most recent full days, excluding today's partial data) | `7` |
| `--metrics <list>` | Comma list of GA4 metric names | `totalUsers,sessions,screenPageViews,newUsers` |
| `--top <n>` | Also list the top n pages by pageviews | off |
| `--channels [n]` | Also break down sessions by default channel group (top n channels; n defaults to `10`) | off |
| `--key-file <path>` | Service-account JSON key (or `GOOGLE_APPLICATION_CREDENTIALS`) | — |
| `--token <token>` | Use an OAuth access token directly (or `GA_ACCESS_TOKEN`) | — |
| `--format <md\|json>` | Output format | `md` |
| `-o, --output <file>` | Write to a file | stdout |

Notes:

- Date range: `--days N` reports the N most recent complete days
  (`NdaysAgo`..`yesterday` in GA4 terms). Today's partial data is excluded so
  numbers do not shift as the day progresses.
- Totals come from GA4 itself (`metricAggregations: ["TOTAL"]`), not from
  adding up the daily rows. GA4 counts users and sessions once per range, so
  a user who visits on two days is one user in Totals and one in each day's
  row: the daily rows can add up to more than the total. Rate metrics such as
  `bounceRate` get their real period-level value and are shown as
  percentages. See Google's
  [session deduplication note](https://developers.google.com/analytics/devguides/collection/ga4/sessions):
  "If you sum the rows, it yields 2 sessions, but the true property total is
  deduplicated to 1."
- Channels: the same applies to `--channels`. Its rows can add up to more
  than the number of sessions, so the section also prints GA4's total
  (`channelsTotalSessions` in JSON) and says so when the rows exceed it.

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
