#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, writeFile } from "node:fs/promises";

import { requestAccessToken } from "./auth.js";
import { DEFAULT_METRICS, buildRunReportBody, parseReport } from "./report.js";
import { runReport } from "./api.js";
import { renderAccountsJson, renderAccountsMarkdown, renderJson, renderMarkdown } from "./render.js";
import { listAccountSummaries, parseAccountSummaries } from "./admin.js";
import type { Report, ServiceAccount } from "./types.js";
import { usageError } from "./usage.js";

const HELP = `ga4 - check a GA4 property's recent traffic from the terminal

Usage:
  ga4 --property <id> [options]
  ga4 --list [--format md|json] [-o <file>]

Authenticates with a Google service account and prints recent users, sessions,
and pageviews for a GA4 property.

Options:
  --list              List the accounts and properties (names and ids) these
                      credentials can see, then exit. Needs the Google
                      Analytics Admin API enabled in the key's project.
  --property <id>     GA4 numeric property id (or env GA_PROPERTY_ID)
  --days <n>          Trailing complete days to report, excluding today (default: 7)
  --metrics <list>    Comma list of GA4 metric names
                      (default: ${DEFAULT_METRICS.join(",")})
  --top <n>           Also list the top n pages by pageviews
  --channels [n]      Also break down sessions by default channel group
                      (top n channels, default: 10)
  --key-file <path>   Service-account JSON key (or env GOOGLE_APPLICATION_CREDENTIALS)
  --token <token>     Use this OAuth access token directly (or env GA_ACCESS_TOKEN)
  --format <md|json>  Output format (default: md)
  -o, --output <file> Write to a file (default: stdout)
  -h, --help          Show this help
  -v, --version       Show version

Setup: create a service account, enable the Analytics Data API, download its
JSON key, and add the service-account email to the GA4 property as a Viewer.
`;

async function readVersion(): Promise<string> {
  const { fileURLToPath } = await import("node:url");
  const { join, dirname } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const raw = await readFile(join(here, "..", "package.json"), "utf8");
    return (JSON.parse(raw) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

/** Resolve an access token from an explicit token or a service-account key. */
async function resolveToken(keyFile: string | undefined, token: string | undefined): Promise<string> {
  const explicit = token ?? process.env.GA_ACCESS_TOKEN;
  if (explicit) {
    return explicit;
  }
  const path = keyFile ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error(
      "no credentials: pass --token, or --key-file / GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account JSON key",
    );
  }
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(await readFile(path, "utf8")) as ServiceAccount;
  } catch (err) {
    throw new Error(`cannot read service-account key "${path}": ${(err as Error).message}`);
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error(`"${path}" is not a service-account key (missing client_email/private_key)`);
  }
  return requestAccessToken(sa);
}

/** Write output to --output or stdout. Returns an exit code. */
async function emit(output: string, file: string | undefined): Promise<number> {
  if (file) {
    try {
      await writeFile(file, output, "utf8");
    } catch (err) {
      process.stderr.write(`error: cannot write "${file}": ${(err as Error).message}\n`);
      return 1;
    }
    process.stderr.write(`ga4: wrote ${file}\n`);
  } else {
    process.stdout.write(output);
  }
  return 0;
}

/** `ga4 --list`: accounts and properties visible to the credentials. */
async function listMode(values: {
  property?: string;
  days?: string;
  metrics?: string;
  top?: string;
  channels?: string;
  "key-file"?: string;
  token?: string;
  format?: string;
  output?: string;
}): Promise<number> {
  const reportOnly = ["property", "days", "metrics", "top", "channels"] as const;
  const given = reportOnly.filter((k) => values[k] !== undefined);
  if (given.length > 0) {
    process.stderr.write(`error: --list cannot be combined with ${given.map((k) => `--${k}`).join(", ")}\n`);
    return 1;
  }
  const format = values.format ?? "md";
  if (format !== "md" && format !== "json") {
    process.stderr.write("error: --format must be md or json\n");
    return 1;
  }
  let accounts;
  try {
    const token = await resolveToken(values["key-file"], values.token);
    accounts = parseAccountSummaries(await listAccountSummaries(token));
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }
  const output = format === "json" ? renderAccountsJson(accounts) : renderAccountsMarkdown(accounts);
  return emit(output, values.output);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv.includes("-v") || argv.includes("--version")) {
    process.stdout.write((await readVersion()) + "\n");
    return 0;
  }

  // --channels takes an optional value (default 10), but parseArgs requires a
  // value for string options, so insert the default before parsing.
  const channelsAt = argv.indexOf("--channels");
  if (channelsAt !== -1) {
    const next = argv[channelsAt + 1];
    if (next === undefined || next.startsWith("-")) {
      argv.splice(channelsAt + 1, 0, "10");
    }
  }

  let values;
  try {
    values = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        list: { type: "boolean" },
        property: { type: "string" },
        days: { type: "string" },
        metrics: { type: "string" },
        top: { type: "string" },
        channels: { type: "string" },
        "key-file": { type: "string" },
        token: { type: "string" },
        format: { type: "string" },
        output: { type: "string", short: "o" },
      },
    }).values;
  } catch (err) {
    process.stderr.write(usageError(err, "ga4"));
    return 1;
  }

  if (values.list) {
    return listMode(values);
  }

  const propertyId = values.property ?? process.env.GA_PROPERTY_ID;
  if (!propertyId) {
    process.stderr.write("error: --property <id> is required (or set GA_PROPERTY_ID)\n");
    return 1;
  }
  const days = values.days ? Number(values.days) : 7;
  if (!Number.isInteger(days) || days < 1) {
    process.stderr.write("error: --days must be a positive integer\n");
    return 1;
  }
  const metrics = values.metrics ? values.metrics.split(",").map((s) => s.trim()) : DEFAULT_METRICS;
  const top = values.top ? Number(values.top) : undefined;
  if (top !== undefined && (!Number.isInteger(top) || top < 1)) {
    process.stderr.write("error: --top must be a positive integer\n");
    return 1;
  }
  const channelCount = values.channels ? Number(values.channels) : undefined;
  if (channelCount !== undefined && (!Number.isInteger(channelCount) || channelCount < 1)) {
    process.stderr.write("error: --channels must be a positive integer\n");
    return 1;
  }
  const format = values.format ?? "md";
  if (format !== "md" && format !== "json") {
    process.stderr.write("error: --format must be md or json\n");
    return 1;
  }

  let token: string;
  try {
    token = await resolveToken(values["key-file"], values.token);
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  let daily: Report;
  let topPages: Report | undefined;
  let channels: Report | undefined;
  try {
    const dailyBody = buildRunReportBody({
      days,
      metrics,
      dimensions: ["date"],
      orderByDimensionAsc: "date",
      withTotals: true,
    });
    daily = parseReport(await runReport(propertyId, dailyBody, token));
    if (top !== undefined) {
      const topBody = buildRunReportBody({
        days,
        metrics: ["screenPageViews"],
        dimensions: ["pagePath"],
        limit: top,
        orderByMetricDesc: "screenPageViews",
      });
      topPages = parseReport(await runReport(propertyId, topBody, token));
    }
    if (channelCount !== undefined) {
      const channelsBody = buildRunReportBody({
        days,
        metrics: ["sessions"],
        dimensions: ["sessionDefaultChannelGroup"],
        limit: channelCount,
        orderByMetricDesc: "sessions",
        withTotals: true,
      });
      channels = parseReport(await runReport(propertyId, channelsBody, token));
    }
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    return 1;
  }

  const input = { propertyId, days, daily, topPages, channels };
  const output = format === "json" ? renderJson(input) : renderMarkdown(input);
  return emit(output, values.output);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    process.stderr.write(`error: ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
