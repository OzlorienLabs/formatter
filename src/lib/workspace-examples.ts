/**
 * Workspaces seeded on the first visit to /workspaces, so the page teaches by
 * example. Inputs and option ids must match the tool specs
 * (src/lib/recipes.test.ts checks them).
 */
import type { Workspace } from "./collections";

// Seeded on first visit, so "saved" reads as just now.
const t = typeof window === "undefined" ? 0 : Date.now();

export const EXAMPLE_WORKSPACES: Workspace[] = [
  {
    id: "ws-example-api",
    name: "Example · API debugging",
    description: "A saved set of payloads for debugging an API integration. Open any item to restore the tool exactly as it was saved.",
    updated: t,
    items: [
      {
        id: "wi-api-1",
        slug: "json-formatter",
        label: "Order webhook payload",
        inputs: { json: '{"event":"order.created","id":"evt_1042","data":{"order":"A-1001","total":42.5,"currency":"EUR","items":[{"sku":"KB-01","qty":1}]}}' },
        opts: { indent: "2", sort: true, tolerant: false, ascii: false },
        note: "Sorted keys make it easy to compare with the staging payload.",
        saved: t,
      },
      {
        id: "wi-api-2",
        slug: "json-diff",
        label: "Staging vs production config",
        inputs: {
          left: '{"api":"https://api.example.com","timeout":30,"retries":3,"features":{"beta":false}}',
          right: '{"api":"https://staging.example.com","timeout":60,"retries":3,"features":{"beta":true,"tracing":true}}',
        },
        opts: { order: false, tolerant: true },
        saved: t,
      },
      {
        id: "wi-api-3",
        slug: "jq-playground",
        label: "Totals by customer",
        inputs: {
          json: '[{"customer":"Ada","total":42.5},{"customer":"Grace","total":18},{"customer":"Ada","total":7.25}]',
          filter: "group_by(.customer) | map({customer: .[0].customer, spent: (map(.total) | add)})",
        },
        opts: { raw: false, compact: false, slurp: false, sort: false, nullin: false },
        saved: t,
      },
    ],
  },
  {
    id: "ws-example-data",
    name: "Example · Data wrangling",
    description: "A sales export being cleaned up and analysed. Each item reopens the tool with its data and query.",
    updated: t,
    items: [
      {
        id: "wi-data-1",
        slug: "csv-query-sql",
        label: "Revenue by region (SQL over CSV)",
        inputs: {
          csv: "region,rep,deal,amount,closed\nEMEA,Ada,Acme,12000,2026-07-02\nEMEA,Grace,Globex,8500,2026-07-19\nAPAC,Linus,Initech,15000,2026-08-05\nAMER,Ada,Umbrella,4300,2026-08-11\nAPAC,Grace,Hooli,9900,2026-09-01",
          sql: "SELECT region, COUNT(*) AS deals, SUM(amount) AS total, ROUND(AVG(amount)) AS avg_deal\nFROM data\nGROUP BY region\nORDER BY total DESC",
        },
        opts: { out: "markdown" },
        note: "Switch Output to CSV to feed a pipeline.",
        saved: t,
      },
      {
        id: "wi-data-2",
        slug: "data-explorer",
        label: "Profile of the raw export",
        inputs: { data: "region,rep,deal,amount,closed\nEMEA,Ada,Acme,12000,2026-07-02\nEMEA,Grace,Globex,8500,2026-07-19\nAPAC,Linus,Initech,15000,2026-08-05\nAMER,Ada,Umbrella,4300,2026-08-11\nAPAC,Grace,Hooli,9900,2026-09-01" },
        opts: {},
        saved: t,
      },
      {
        id: "wi-data-3",
        slug: "regex-tester",
        label: "Normalise dates to ISO",
        inputs: { text: "Closed 02/07/2026, 19/07/2026 and 05/08/2026", pattern: "(\\d{2})/(\\d{2})/(\\d{4})", replacement: "$3-$2-$1" },
        opts: { mode: "replace" },
        saved: t,
      },
    ],
  },
  {
    id: "ws-example-devops",
    name: "Example · Release checklist",
    description: "Everything needed to ship the nightly job: schedule, environment and workflow review.",
    updated: t,
    items: [
      {
        id: "wi-ops-1",
        slug: "cron-builder",
        label: "Nightly export at 02:30 on weekdays",
        inputs: { expr: "30 2 * * 1-5" },
        opts: { tz: "Europe/London", format: "k8s" },
        saved: t,
      },
      {
        id: "wi-ops-2",
        slug: "env-toolkit",
        label: "Production .env → Kubernetes Secret",
        inputs: { env: "DATABASE_URL=postgres://app@db.internal:5432/app\nREDIS_URL=redis://cache.internal:6379/0\nLOG_LEVEL=info", other: "" },
        opts: { mode: "convert", to: "secret", name: "nightly-export" },
        saved: t,
      },
      {
        id: "wi-ops-3",
        slug: "gha-explainer",
        label: "Review the CI workflow",
        inputs: {
          yaml: "name: nightly\non:\n  schedule:\n    - cron: '30 2 * * 1-5'\n  workflow_dispatch:\njobs:\n  export:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 20\n      - run: npm ci && npm run export",
        },
        opts: {},
        note: "The lint tab flags the missing permissions block and timeout.",
        saved: t,
      },
    ],
  },
];
