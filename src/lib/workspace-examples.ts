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
];
