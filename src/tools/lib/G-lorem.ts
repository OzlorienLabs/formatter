/**
 * Placeholder text generator: seeded, four vocabularies, five units, four
 * output formats. Pure and synchronous — no dependencies.
 */
import { mulberry32, seedFrom, type Rng } from "./G-rand";

export const VOCABS: Record<string, { label: string; words: string[]; opener: string }> = {
  latin: {
    label: "Classic Latin",
    opener: "Lorem ipsum dolor sit amet, consectetur adipiscing elit",
    words: (
      "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam " +
      "quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum " +
      "fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur " +
      "pretium tincidunt lacus nulla gravida orci a odio nullam varius turpis et commodo pharetra eros bibendum elit nec luctus magna felis " +
      "sollicitudin mauris integer dignissim augue nisl mattis vitae sagittis lectus porta morbi aliquet vel mollis condimentum ligula pellentesque " +
      "habitant senectus netus malesuada fames ac turpis egestas vestibulum tortor quam feugiat vitae ultricies eget tempor donec eu libero sit " +
      "amet quam egestas semper aenean ultricies mi vitae est mauris placerat eleifend leo quisque sit amet est et sapien ullamcorper pharetra " +
      "proin quis tortor orci etiam at risus viverra adipiscing at in tellus integer feugiat scelerisque varius morbi enim nunc faucibus a " +
      "pellentesque habitant cras fermentum odio eu feugiat pretium nibh ipsum consequat nisl vel pretium lectus quam id leo in vitae turpis " +
      "massa sed elementum tempus egestas sed sed risus pretium quam vulputate dignissim suspendisse in est ante in nibh mauris cursus mattis " +
      "molestie iaculis urna fringilla rhoncus dolor purus non enim praesent elementum facilisis leo vel fringilla est ullamcorper eget nulla " +
      "facilisi etiam dignissim diam quis enim lobortis scelerisque fermentum dui faucibus ornare suspendisse sed nisi lacus"
    ).split(" "),
  },
  english: {
    label: "English-like",
    opener: "The quick brown fox jumps over the lazy dog",
    words: (
      "the a an of and to in for with on at by from about into over after under between through during without before around among " +
      "morning river garden window market letter station evening harbor village kitchen mountain bridge valley forest island meadow city " +
      "people teacher friend neighbor traveler farmer baker painter writer child family stranger captain musician sailor gardener " +
      "walked found carried opened noticed painted watched followed gathered crossed remembered explained listened answered wondered " +
      "quiet bright gentle early golden narrow ancient careful distant warm heavy simple patient curious sudden familiar steady " +
      "slowly softly nearly always often rarely together outside almost quickly perhaps suddenly finally gently " +
      "bread coffee lantern bicycle umbrella notebook blanket teapot compass basket candle ribbon postcard journey silence weather story " +
      "light rain wind snow sun moon cloud shadow stone water fire road door table chair book song dream idea question answer promise"
    ).split(" "),
  },
  tech: {
    label: "Tech jargon",
    opener: "Deploy the microservice behind a load balancer with zero downtime",
    words: (
      "api endpoint cluster container kubernetes pod node deployment pipeline commit branch merge rebase repository latency throughput " +
      "cache cdn edge serverless function lambda queue stream event broker kafka topic partition shard replica database index schema " +
      "migration query transaction rollback idempotent stateless async await promise callback thread mutex lock race condition heap stack " +
      "compiler runtime bytecode interpreter garbage collector memory leak profiler benchmark regression test fixture mock stub integration " +
      "observability tracing metrics logging dashboard alert incident postmortem rollout canary feature flag config secret token oauth jwt " +
      "tls certificate proxy gateway ingress load balancer autoscaling horizontal vertical frontend backend fullstack component hook state " +
      "reducer render hydrate bundle tree-shaking minify transpile polyfill webassembly websocket graphql rest grpc protobuf payload " +
      "refactor deprecate scaffold bootstrap provision orchestrate containerize deploy ship iterate optimize debounce throttle"
    ).split(" "),
  },
  business: {
    label: "Business",
    opener: "Leverage synergies to drive stakeholder value across the organization",
    words: (
      "leverage synergy stakeholder alignment roadmap deliverable milestone bandwidth runway pipeline funnel conversion retention churn " +
      "revenue margin growth scale strategy vision mission initiative framework paradigm ecosystem platform solution value proposition " +
      "customer journey touchpoint engagement onboarding offboarding quarterly objective key result kpi metric benchmark forecast budget " +
      "headcount resourcing prioritize incentivize operationalize streamline optimize empower enable drive unlock accelerate transform " +
      "innovate disrupt pivot iterate align circle back deep dive low-hanging fruit best practice core competency thought leadership " +
      "best-in-class mission-critical cross-functional customer-centric data-driven scalable sustainable holistic agile lean robust " +
      "actionable insight takeaway win-win moving forward going forward at the end of the day offline sync touch base action item " +
      "market share go-to-market brand positioning partnership vendor procurement compliance governance transparency accountability"
    ).split(" "),
  },
};

export type LoremOpts = {
  unit: "paragraphs" | "sentences" | "words" | "list" | "headings";
  count: number;
  start: boolean;
  vocab: string;
  format: "plain" | "html" | "markdown" | "json";
  length: "short" | "medium" | "long";
  seed: string;
};

const LEN = {
  short: { words: [4, 9], sentences: [2, 4] },
  medium: { words: [7, 15], sentences: [4, 7] },
  long: { words: [12, 22], sentences: [7, 11] },
};

const between = (r: Rng, [a, b]: number[]) => a + Math.floor(r() * (b - a + 1));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function words(r: Rng, vocab: string[], n: number): string[] {
  const out: string[] = [];
  let last = "";
  while (out.length < n) {
    const w = vocab[Math.floor(r() * vocab.length)];
    if (w === last) continue; // avoid "dolor dolor"
    out.push(w);
    last = w;
  }
  return out;
}

function sentence(r: Rng, vocab: string[], len: number[]): string {
  const ws = words(r, vocab, between(r, len));
  // a comma in longer sentences reads more naturally
  if (ws.length > 7 && r() < 0.55) ws[between(r, [2, ws.length - 4])] += ",";
  const end = r() < 0.08 ? "?" : r() < 0.04 ? "!" : ".";
  return cap(ws.join(" ")) + end;
}

export function generateLorem(o: LoremOpts): { text: string; items: string[]; seed: number } {
  const seed = seedFrom(o.seed);
  const r = mulberry32(seed);
  const v = VOCABS[o.vocab] ?? VOCABS.latin;
  const len = LEN[o.length] ?? LEN.medium;
  const n = Math.max(1, Math.min(o.count, 5000));
  let items: string[] = [];
  const opener = v.opener;

  switch (o.unit) {
    case "words": {
      let ws = words(r, v.words, n);
      if (o.start) ws = [...opener.replace(/[,.]/g, "").toLowerCase().split(" "), ...ws].slice(0, n);
      items = ws;
      break;
    }
    case "sentences":
      for (let i = 0; i < n; i++) items.push(sentence(r, v.words, len.words));
      if (o.start) items[0] = opener + ".";
      break;
    case "paragraphs":
      for (let i = 0; i < n; i++) {
        const ss: string[] = [];
        const k = between(r, len.sentences);
        for (let j = 0; j < k; j++) ss.push(sentence(r, v.words, len.words));
        if (i === 0 && o.start) ss[0] = opener + ".";
        items.push(ss.join(" "));
      }
      break;
    case "list":
      for (let i = 0; i < n; i++) items.push(sentence(r, v.words, [Math.max(2, len.words[0] - 3), Math.max(4, len.words[1] - 6)]).replace(/[.?!]$/, ""));
      if (o.start) items[0] = opener.split(",")[0];
      break;
    case "headings":
      for (let i = 0; i < n; i++) items.push(words(r, v.words, between(r, [2, 6])).map(cap).join(" "));
      if (o.start) items[0] = opener.split(",")[0].split(" ").slice(0, 5).map(cap).join(" ");
      break;
  }

  return { text: render(items, o), items, seed };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function render(items: string[], o: LoremOpts): string {
  const u = o.unit;
  switch (o.format) {
    case "json":
      return JSON.stringify(items, null, 2);
    case "html":
      if (u === "paragraphs") return items.map((p) => `<p>${esc(p)}</p>`).join("\n");
      if (u === "list") return `<ul>\n${items.map((p) => `  <li>${esc(p)}</li>`).join("\n")}\n</ul>`;
      if (u === "headings") return items.map((p, i) => `<h${Math.min(6, (i % 3) + 1)}>${esc(p)}</h${Math.min(6, (i % 3) + 1)}>`).join("\n");
      if (u === "sentences") return `<p>${esc(items.join(" "))}</p>`;
      return `<p>${esc(items.join(" "))}</p>`;
    case "markdown":
      if (u === "paragraphs") return items.join("\n\n");
      if (u === "list") return items.map((p) => `- ${p}`).join("\n");
      if (u === "headings") return items.map((p, i) => `${"#".repeat((i % 3) + 1)} ${p}`).join("\n\n");
      return items.join(" ");
    default:
      if (u === "paragraphs") return items.join("\n\n");
      if (u === "list") return items.map((p) => `• ${p}`).join("\n");
      if (u === "headings") return items.join("\n");
      if (u === "sentences") return items.join(" ");
      return items.join(" ");
  }
}
