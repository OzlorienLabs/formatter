/**
 * Built-in sample datasets for the SQL tools. Generated deterministically from
 * a seeded PRNG so every visitor (and every test run) sees the same rows.
 */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const csv = (header: string[], rows: (string | number | boolean | null)[][]) =>
  [header.join(","), ...rows.map((r) => r.map((v) => (v == null ? "" : typeof v === "string" && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(","))].join("\n");

const FIRST = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Katherine", "Dennis", "Barbara", "Ken", "Frances", "Tim", "Radia", "Guido", "Anita", "Bjarne", "Hedy", "John", "Sophie", "Edsger", "Joan", "Niklaus", "Karen", "Donald", "Shafi", "Yukihiro"];
const LAST = ["Lovelace", "Hopper", "Torvalds", "Hamilton", "Turing", "Johnson", "Ritchie", "Liskov", "Thompson", "Allen", "Berners-Lee", "Perlman", "van Rossum", "Borg", "Stroustrup", "Lamarr", "McCarthy", "Wilson", "Dijkstra", "Clarke", "Wirth", "Spärck Jones", "Knuth", "Goldwasser", "Matsumoto"];
const CITIES: [string, string][] = [["London", "GB"], ["Manchester", "GB"], ["New York", "US"], ["Austin", "US"], ["Seattle", "US"], ["Berlin", "DE"], ["Munich", "DE"], ["Paris", "FR"], ["Lyon", "FR"], ["Helsinki", "FI"], ["Tokyo", "JP"], ["Toronto", "CA"], ["Sydney", "AU"], ["São Paulo", "BR"]];
const REGION: Record<string, string> = { GB: "EMEA", DE: "EMEA", FR: "EMEA", FI: "EMEA", US: "Americas", CA: "Americas", BR: "Americas", JP: "APAC", AU: "APAC" };
const PRODUCTS: [string, string, number, number][] = [
  ["Mechanical Keyboard", "Peripherals", 89.0, 41.5],
  ["Wireless Mouse", "Peripherals", 29.5, 11.2],
  ["27in 4K Monitor", "Displays", 349.0, 228.0],
  ["34in Ultrawide", "Displays", 529.0, 351.0],
  ["USB-C Hub", "Accessories", 45.0, 17.9],
  ["Laptop Stand", "Accessories", 39.0, 14.0],
  ["Noise-cancelling Headset", "Audio", 159.0, 82.0],
  ["Desk Microphone", "Audio", 119.0, 58.5],
  ["HD Webcam", "Video", 79.0, 36.0],
  ["Ring Light", "Video", 35.0, 12.4],
  ["Standing Desk", "Furniture", 499.0, 310.0],
  ["Ergonomic Chair", "Furniture", 389.0, 205.0],
  ["Cable Kit", "Accessories", 19.0, 5.2],
  ["Portable SSD 1TB", "Storage", 119.0, 71.0],
  ["NAS 4-bay", "Storage", 459.0, 298.0],
  ["Docking Station", "Accessories", 229.0, 131.0],
  ["Drawing Tablet", "Peripherals", 199.0, 104.0],
  ["Smart Speaker", "Audio", 99.0, 47.0],
  ["E-reader", "Devices", 139.0, 88.0],
  ["Tablet 11in", "Devices", 599.0, 402.0],
];

const pad = (n: number) => String(n).padStart(2, "0");
const day = (base: Date, add: number) => {
  const d = new Date(base.getTime() + add * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

export function customersCsv(): string {
  const r = rng(11);
  const rows = Array.from({ length: 50 }, (_, i) => {
    const f = FIRST[i % FIRST.length], l = LAST[(i * 7) % LAST.length];
    const [city, country] = CITIES[Math.floor(r() * CITIES.length)];
    const plan = ["free", "pro", "pro", "team", "enterprise"][Math.floor(r() * 5)];
    return [i + 1, `${f} ${l}`, `${f.toLowerCase()}.${l.toLowerCase().replace(/[^a-z]/g, "")}${i}@example.com`, city, country, REGION[country], plan, day(new Date(Date.UTC(2023, 0, 1)), Math.floor(r() * 900))];
  });
  return csv(["customer_id", "name", "email", "city", "country", "region", "plan", "signup_date"], rows);
}

export function productsCsv(): string {
  return csv(
    ["product_id", "name", "category", "price", "unit_cost", "in_stock"],
    PRODUCTS.map((p, i) => [i + 1, p[0], p[1], p[2].toFixed(2), p[3].toFixed(2), i % 7 !== 3])
  );
}

export function salesCsv(): string {
  const r = rng(42);
  const channels = ["web", "web", "web", "mobile", "mobile", "partner", "retail"];
  const base = new Date(Date.UTC(2025, 0, 1));
  const rows = Array.from({ length: 360 }, (_, i) => {
    const pid = 1 + Math.floor(Math.pow(r(), 1.6) * PRODUCTS.length);
    const cid = 1 + Math.floor(r() * 50);
    const qty = 1 + Math.floor(Math.pow(r(), 2.5) * 6);
    const d = day(base, Math.floor((i / 360) * 540 + r() * 12));
    const disc = r() < 0.2 ? [0.05, 0.1, 0.15, 0.2][Math.floor(r() * 4)] : 0;
    const unit = PRODUCTS[pid - 1][2];
    return [5000 + i, d, cid, pid, qty, unit.toFixed(2), disc, (qty * unit * (1 - disc)).toFixed(2), channels[Math.floor(r() * channels.length)], r() < 0.04 ? "refunded" : r() < 0.1 ? "pending" : "complete"];
  });
  return csv(["order_id", "order_date", "customer_id", "product_id", "quantity", "unit_price", "discount", "revenue", "channel", "status"], rows);
}

export function webEventsNdjson(): string {
  const r = rng(7);
  const pages = ["/", "/pricing", "/docs", "/docs/getting-started", "/blog", "/signup", "/checkout", "/account"];
  const devices = ["desktop", "desktop", "mobile", "mobile", "tablet"];
  const countries = ["GB", "US", "US", "DE", "FR", "FI", "JP", "CA", "AU", "BR"];
  const out: string[] = [];
  let t = Date.UTC(2025, 5, 2, 8, 0, 0);
  for (let s = 0; s < 80; s++) {
    const session = `s_${(s + 1).toString(36).padStart(4, "0")}`;
    const user = r() < 0.3 ? null : 1 + Math.floor(r() * 50);
    const device = devices[Math.floor(r() * devices.length)];
    const country = countries[Math.floor(r() * countries.length)];
    const n = 1 + Math.floor(r() * 7);
    t += Math.floor(r() * 40 * 60000);
    let tt = t;
    for (let k = 0; k < n; k++) {
      const page = k === 0 ? pages[Math.floor(r() * 3)] : pages[Math.floor(r() * pages.length)];
      const type = page === "/checkout" && r() < 0.5 ? "purchase" : page === "/signup" && r() < 0.5 ? "signup" : r() < 0.25 ? "click" : "page_view";
      out.push(JSON.stringify({ event_time: new Date(tt).toISOString().replace(".000", ""), session_id: session, user_id: user, page, event_type: type, duration_ms: 400 + Math.floor(r() * 25000), device, country }));
      tt += 5000 + Math.floor(r() * 120000);
    }
  }
  return out.join("\n");
}

export const SAMPLES: Record<string, { format: "csv" | "ndjson"; describe: string; data: () => string }> = {
  sales: { format: "csv", describe: "360 orders, 2025–2026: date, customer, product, quantity, revenue, channel, status", data: salesCsv },
  customers: { format: "csv", describe: "50 customers with city, country, region, plan and signup date", data: customersCsv },
  products: { format: "csv", describe: "20 products with category, price and unit cost", data: productsCsv },
  web_events: { format: "ndjson", describe: "~320 web analytics events across 80 sessions (NDJSON)", data: webEventsNdjson },
};
