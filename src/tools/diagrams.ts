import { isNode } from "./lib/vendor";
import { ToolError, str, type Result, type SpecModule, type View } from "./types";

/* ── Graphviz ────────────────────────────────────────────────────────── */

type GraphvizApi = { layout: (src: string, format: string, engine: string) => string; version: () => string };
let gvP: Promise<GraphvizApi> | null = null;
function graphviz(): Promise<GraphvizApi> {
  if (!gvP) {
    gvP = import("@hpcc-js/wasm/graphviz").then((m) => m.Graphviz.load() as unknown as Promise<GraphvizApi>);
    gvP.catch(() => (gvP = null));
  }
  return gvP;
}

const THEMES: Record<string, string> = {
  modern:
    'graph [fontname="Helvetica,Arial,sans-serif" fontsize=12 pad=0.3 nodesep=0.45 ranksep=0.55]\n  node [fontname="Helvetica,Arial,sans-serif" fontsize=11 shape=box style="rounded,filled" fillcolor="#eef6fa" color="#0088b0" penwidth=1.2]\n  edge [fontname="Helvetica,Arial,sans-serif" fontsize=10 color="#5b6770" arrowsize=0.7]',
  dark:
    'graph [bgcolor="#1d1f27" fontcolor="#e6e6e6" fontname="Helvetica,Arial,sans-serif" pad=0.3]\n  node [fontname="Helvetica,Arial,sans-serif" style="rounded,filled" shape=box fillcolor="#2b2e3b" color="#7dd3fc" fontcolor="#f1f5f9"]\n  edge [fontname="Helvetica,Arial,sans-serif" color="#94a3b8" fontcolor="#cbd5e1"]',
  sketch:
    'graph [fontname="Comic Sans MS,Chalkboard,cursive" pad=0.3]\n  node [fontname="Comic Sans MS,Chalkboard,cursive" style="rounded,filled" shape=box fillcolor="#fffbe6" color="#333333" penwidth=1.6]\n  edge [fontname="Comic Sans MS,Chalkboard,cursive" penwidth=1.3]',
  mono: 'graph [fontname="Courier,monospace"]\n  node [fontname="Courier,monospace" shape=box color=black fillcolor=white style=filled]\n  edge [fontname="Courier,monospace" color=black]',
};

/** Insert theme defaults after the opening brace and a rankdir before the closing one. */
function decorate(src: string, theme: string, rankdir: string): string {
  let s = src;
  const open = s.search(/\{/);
  if (open < 0) return s;
  if (THEMES[theme]) s = `${s.slice(0, open + 1)}\n  ${THEMES[theme]}\n${s.slice(open + 1)}`;
  if (rankdir !== "auto") {
    const close = s.lastIndexOf("}");
    if (close > 0) s = `${s.slice(0, close)}  graph [rankdir=${rankdir}]\n${s.slice(close)}`;
  }
  return s;
}

function gvError(e: unknown, src: string, shift: number): ToolError {
  const msg = String((e as Error)?.message ?? e).trim().replace(/^Error:\s*/, "");
  const m = msg.match(/line (\d+)(?: near '(.*)')?/);
  if (m) {
    const line = Math.max(1, Number(m[1]) - shift);
    const text = src.split("\n")[line - 1] ?? "";
    return new ToolError(`Graphviz syntax error on line ${line}${m[2] ? ` near "${m[2]}"` : ""}:\n  ${line} | ${text}\nCheck for a missing semicolon, bracket or quote on this or the previous line.`);
  }
  return new ToolError(`Graphviz: ${msg || "layout failed"}`);
}

/* ── Graphviz examples ───────────────────────────────────────────────── */

const DOT_MICRO = `digraph microservices {
  rankdir=LR
  node [shape=box style="rounded,filled" fillcolor="#f5f7fa" fontname="Helvetica"]
  edge [fontname="Helvetica" fontsize=10]

  client [label="Web / Mobile\\nclients" shape=component fillcolor="#e0f2fe"]
  gateway [label="API Gateway" fillcolor="#fde68a"]

  subgraph cluster_orders {
    label="Orders domain" style="rounded,dashed" color="#0088b0"
    orders [label="orders-svc"]
    ordersdb [label="orders DB" shape=cylinder fillcolor="#dbeafe"]
    orders -> ordersdb
  }
  subgraph cluster_payments {
    label="Payments domain" style="rounded,dashed" color="#d6006c"
    payments [label="payments-svc"]
    ledger [label="ledger DB" shape=cylinder fillcolor="#fce7f3"]
    payments -> ledger
  }
  subgraph cluster_async {
    label="Async" style=rounded color=gray60
    bus [label="event bus" shape=cds fillcolor="#ede9fe"]
    notify [label="notifications"]
  }

  client -> gateway [label="HTTPS"]
  gateway -> orders [label="REST"]
  gateway -> payments [label="gRPC"]
  orders -> bus [label="OrderPlaced" style=dashed]
  payments -> bus [label="PaymentCaptured" style=dashed]
  bus -> notify [style=dashed]
}`;

const DOT_STATE = `digraph traffic_light {
  rankdir=LR
  node [shape=circle fontname="Helvetica" width=1.1 fixedsize=true style=filled]
  start [shape=point width=0.2]
  red    [fillcolor="#fecaca"]
  green  [fillcolor="#bbf7d0"]
  yellow [fillcolor="#fef08a"]
  off    [shape=doublecircle fillcolor="#e5e7eb"]

  start -> red
  red -> green [label="timer 30s"]
  green -> yellow [label="timer 25s"]
  yellow -> red [label="timer 5s"]
  red -> off [label="power cut" style=dashed]
  green -> off [label="power cut" style=dashed]
  yellow -> off [label="power cut" style=dashed]
}`;

const DOT_SCHEMA = `digraph schema {
  rankdir=LR
  node [shape=plaintext fontname="Helvetica" fontsize=11]
  edge [arrowhead=crow arrowtail=none dir=both color="#555555"]

  users [label=<
    <table border="0" cellborder="1" cellspacing="0" cellpadding="5">
      <tr><td bgcolor="#0088b0"><font color="white"><b>users</b></font></td></tr>
      <tr><td port="id" align="left">🔑 id  <i>bigint</i></td></tr>
      <tr><td align="left">email  <i>text</i></td></tr>
      <tr><td align="left">created_at  <i>timestamptz</i></td></tr>
    </table>>]

  orders [label=<
    <table border="0" cellborder="1" cellspacing="0" cellpadding="5">
      <tr><td bgcolor="#d6006c"><font color="white"><b>orders</b></font></td></tr>
      <tr><td port="id" align="left">🔑 id  <i>bigint</i></td></tr>
      <tr><td port="user" align="left">user_id  <i>bigint</i></td></tr>
      <tr><td align="left">total  <i>numeric(10,2)</i></td></tr>
    </table>>]

  items [label=<
    <table border="0" cellborder="1" cellspacing="0" cellpadding="5">
      <tr><td bgcolor="#b98d00"><font color="white"><b>order_items</b></font></td></tr>
      <tr><td port="order" align="left">order_id  <i>bigint</i></td></tr>
      <tr><td align="left">sku  <i>text</i></td></tr>
      <tr><td align="left">qty  <i>int</i></td></tr>
    </table>>]

  users:id -> orders:user
  orders:id -> items:order
}`;

const DOT_ORG = `digraph org {
  node [shape=box style="rounded,filled" fontname="Helvetica" fillcolor="#f8fafc"]
  edge [arrowhead=none color="#94a3b8"]
  splines=ortho

  ceo [label="Ada Lovelace\\nCEO" fillcolor="#fde68a"]
  cto [label="Grace Hopper\\nCTO"] cfo [label="Luca Pacioli\\nCFO"] coo [label="Mary Parker\\nCOO"]
  eng1 [label="Platform team"] eng2 [label="Product team"] sec [label="Security"]
  acct [label="Accounting"] ops [label="Operations"] sup [label="Support"]

  ceo -> {cto cfo coo}
  cto -> {eng1 eng2 sec}
  cfo -> acct
  coo -> {ops sup}

  {rank=same; cto cfo coo}
  {rank=same; eng1 eng2 sec acct ops sup}
}`;

const DOT_NETWORK = `graph office_network {
  layout=neato
  overlap=false
  splines=true
  node [fontname="Helvetica" fontsize=10 style=filled]

  internet [shape=doublecircle label="Internet" fillcolor="#e0f2fe"]
  router [shape=box label="Router" fillcolor="#fde68a"]
  switch1 [shape=box label="Switch A"] switch2 [shape=box label="Switch B"]
  nas [shape=cylinder label="NAS" fillcolor="#dcfce7"]
  printer [label="Printer"] wifi [label="Wi-Fi AP" fillcolor="#fce7f3"]
  pc1 [label="PC 1"] pc2 [label="PC 2"] pc3 [label="PC 3"] laptop [label="Laptop"] phone [label="Phone"]

  internet -- router [len=1.6 penwidth=2]
  router -- switch1 [len=1.2] router -- switch2 [len=1.2] router -- wifi [len=1.3]
  switch1 -- pc1 switch1 -- pc2 switch1 -- printer
  switch2 -- pc3 switch2 -- nas [penwidth=2]
  wifi -- laptop [style=dashed] wifi -- phone [style=dashed]
}`;

const DOT_RADIAL = `digraph radial {
  layout=twopi
  root=web
  ranksep=1.3
  node [shape=circle style=filled fontname="Helvetica" fontsize=10 width=0.6 fixedsize=true]
  web [label="Web\\nDev" fillcolor="#0088b0" fontcolor=white width=0.9]
  node [fillcolor="#e0f2fe"]
  web -> {html css js a11y perf}
  node [fillcolor="#fce7f3"]
  js -> {ts react node wasm}
  css -> {grid flex anim}
  perf -> {cache cdn lazy}
  node [fillcolor="#fef9c3"]
  a11y -> {aria wcag}
}`;

const DOT_DEPS = `digraph deps {
  rankdir=BT
  node [shape=box style="rounded,filled" fontname="Helvetica" fontsize=11 fillcolor=white]
  edge [color="#64748b" arrowsize=0.7]

  app [label="app" fillcolor="#fde68a"]
  ui [label="@acme/ui"] api [label="@acme/api-client"] auth [label="@acme/auth"]
  utils [label="@acme/utils" fillcolor="#e0f2fe"]
  react [label="react" fillcolor="#f1f5f9" style="rounded,filled,dashed"]
  zod [label="zod" fillcolor="#f1f5f9" style="rounded,filled,dashed"]

  app -> {ui api auth}
  ui -> {utils react}
  api -> {utils zod}
  auth -> {api utils}
  auth -> ui [color="#d6006c" label="cycle?" fontcolor="#d6006c" fontsize=9]
  ui -> auth [color="#d6006c"]
}`;

const DOT_FLOW = `digraph checkout {
  node [fontname="Helvetica" fontsize=11]
  edge [fontname="Helvetica" fontsize=10]

  start [shape=oval label="Cart" style=filled fillcolor="#e0f2fe"]
  logged [shape=diamond label="Signed in?" style=filled fillcolor="#fef9c3"]
  login [shape=box label="Sign in / guest" style=rounded]
  address [shape=box label="Shipping address" style=rounded]
  pay [shape=box label="Payment" style=rounded]
  ok [shape=diamond label="Authorised?" style=filled fillcolor="#fef9c3"]
  retry [shape=box label="Show error,\\noffer retry" style="rounded,filled" fillcolor="#fee2e2" color="#d6006c"]
  done [shape=oval label="Order placed" style=filled fillcolor="#dcfce7" color="#16a34a" penwidth=2]

  start -> logged
  logged -> address [label="yes"]
  logged -> login [label="no"]
  login -> address
  address -> pay -> ok
  ok -> done [label="yes" color="#16a34a"]
  ok -> retry [label="no" color="#d6006c"]
  retry -> pay [style=dashed]
}`;

/* ── Mermaid examples ────────────────────────────────────────────────── */

const MMD = {
  flowchart: `flowchart LR
  A([Visitor]) --> B{Signed in?}
  B -- yes --> C[Dashboard]
  B -- no --> D[Login page]
  D --> E[(Users DB)]
  E -->|valid| C
  E -.->|invalid| D

  subgraph Backend
    direction TB
    E
    F[[Auth service]]
  end
  D --> F

  classDef accent fill:#fde68a,stroke:#b98d00,color:#201e1d
  class B accent
  style C fill:#dcfce7,stroke:#16a34a`,
  sequence: `sequenceDiagram
  autonumber
  actor U as User
  participant W as Web app
  participant A as Auth API
  participant D as Database

  U->>+W: Open /account
  W->>+A: GET /session (cookie)
  A->>D: SELECT session
  D-->>A: row
  alt session valid
    A-->>W: 200 {user}
  else expired
    A-->>W: 401
    W->>U: Redirect to /login
  end
  deactivate A
  loop every 5 minutes
    W-)A: refresh token
  end
  Note over W,A: Tokens rotate silently
  W-->>-U: Render account page`,
  class: `classDiagram
  direction LR
  class Shape {
    <<abstract>>
    +String name
    +area() double*
    +toString() String
  }
  class Circle {
    -double radius
    +area() double
  }
  class Rectangle {
    -double width
    -double height
    +area() double
  }
  class Drawing {
    +List~Shape~ shapes
    +add(Shape s) void
  }
  Shape <|-- Circle
  Shape <|-- Rectangle
  Drawing "1" o-- "*" Shape : contains
  class Renderer {
    <<interface>>
    +render(Drawing d) void
  }
  Renderer ..> Drawing : uses`,
  state: `stateDiagram-v2
  [*] --> Draft
  Draft --> Review : submit
  Review --> Draft : request changes
  Review --> Approved : approve
  state Approved {
    [*] --> Scheduled
    Scheduled --> Published : publish time
    Published --> [*]
  }
  Approved --> Archived : archive
  Archived --> [*]
  note right of Review
    Two approvals needed
  end note`,
  er: `erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  PRODUCT ||--o{ LINE_ITEM : "ordered in"
  CUSTOMER {
    bigint id PK
    string email UK
    string name
  }
  ORDER {
    bigint id PK
    bigint customer_id FK
    date placed_on
    decimal total
  }
  LINE_ITEM {
    bigint order_id FK
    string sku FK
    int qty
  }
  PRODUCT {
    string sku PK
    string title
    decimal price
  }`,
  gantt: `gantt
  title Website relaunch
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  excludes weekends
  section Discovery
    Research          :done,    r1, 2026-09-01, 5d
    Wireframes        :done,    w1, after r1, 4d
  section Build
    Design system     :active,  d1, after w1, 8d
    Pages             :         p1, after d1, 10d
    Content migration :         c1, after w1, 12d
  section Launch
    QA & fixes        :crit,    q1, after p1, 5d
    Go live           :milestone, m1, after q1, 0d`,
  pie: `pie showData
  title Where the build minutes go
  "Tests" : 42
  "Type-check" : 18
  "Bundling" : 25
  "Linting" : 9
  "Deploy" : 6`,
  journey: `journey
  title Ordering coffee in the app
  section Discover
    Open app: 5: Customer
    Find favourite drink: 3: Customer
  section Order
    Customise size and milk: 4: Customer
    Pay with saved card: 5: Customer, Payments
  section Pick up
    Wait at counter: 2: Customer, Barista
    Collect drink: 5: Customer`,
  git: `gitGraph
  commit id: "init"
  commit id: "readme"
  branch feature/login
  checkout feature/login
  commit id: "form"
  commit id: "validation"
  checkout main
  commit id: "hotfix" type: HIGHLIGHT
  merge feature/login tag: "v1.1.0"
  branch release
  commit id: "changelog"
  checkout main
  merge release`,
  mindmap: `mindmap
  root((Offline-first app))
    Storage
      IndexedDB
      Cache API
      OPFS
    Sync
      Conflict resolution
        CRDTs
        Last write wins
      Background sync
    UX
      Optimistic updates
      Status indicators`,
  timeline: `timeline
  title History of the web platform
  1991 : HTML
  1996 : CSS level 1 : JavaScript 1.0
  2008 : Chrome and V8
  2014 : HTML5 recommendation
  2017 : WebAssembly MVP
  2020 : Service workers everywhere`,
  quadrant: `quadrantChart
  title Feature prioritisation
  x-axis Low effort --> High effort
  y-axis Low impact --> High impact
  quadrant-1 Plan carefully
  quadrant-2 Do now
  quadrant-3 Maybe later
  quadrant-4 Avoid
  Dark mode: [0.25, 0.7]
  Offline sync: [0.8, 0.9]
  New logo: [0.3, 0.2]
  Rewrite in Rust: [0.9, 0.35]
  Keyboard shortcuts: [0.2, 0.55]`,
  sankey: `sankey-beta
Salary,Rent,1400
Salary,Food,550
Salary,Savings,700
Salary,Transport,180
Freelance,Savings,300
Freelance,Hobbies,220
Savings,Index funds,800
Savings,Emergency fund,200`,
  xychart: `xychart-beta
  title "Monthly active users (thousands)"
  x-axis [Jan, Feb, Mar, Apr, May, Jun]
  y-axis "Users" 0 --> 60
  bar [12, 18, 25, 31, 44, 52]
  line [12, 18, 25, 31, 44, 52]`,
  block: `block-beta
  columns 3
  Frontend:3
  API["API gateway"] Auth["Auth"] Search["Search"]
  space DB[("Postgres")] space
  Frontend --> API
  API --> DB
  Auth --> DB`,
  architecture: `architecture-beta
  group cloud(cloud)[Cloud]
  service web(internet)[Browser]
  service api(server)[API] in cloud
  service db(database)[Database] in cloud
  service files(disk)[Object storage] in cloud
  web:R --> L:api
  api:R --> L:db
  api:B --> T:files`,
  broken: `flowchart TD
  A[Start] --> B{Decision
  B -->|yes| C[OK]
  B -->|no| D[Retry]`,
};

/* ── PlantUML examples ───────────────────────────────────────────────── */

const PUML = {
  sequence: `@startuml
title Login with MFA
autonumber
actor User
participant "Web app" as Web
participant "Auth API" as Auth
database Users

User -> Web : submit email + password
activate Web
Web -> Auth ++ : POST /login
Auth -> Users : find user
Users --> Auth : user record
alt password ok
  Auth --> Web : 200 + MFA challenge
  Web -> User : ask for 6-digit code
  User -> Web : 123456
  Web -> Auth : POST /mfa
  Auth --> Web -- : session cookie
else wrong password
  Auth --> Web : 401
  note right of Web : show generic error\\n(no user enumeration)
end
== After login ==
loop every 10 minutes
  Web ->> Auth : refresh
end
Web --> User : dashboard
deactivate Web
@enduml`,
  class: `@startuml
skinparam classAttributeIconSize 0
package billing {
  abstract class Invoice {
    -id : UUID
    #issuedAt : Date
    +total() : Money
    {abstract} +render(format : String) : Bytes
  }
  class LineItem {
    +sku : String
    +qty : int
    +price : Money
  }
  enum Status {
    DRAFT
    SENT
    PAID
  }
}
interface Payable {
  +pay(amount : Money) : Receipt
}
class Customer {
  +name : String
  {static} +count : int
}
Invoice <|-- ProformaInvoice
Invoice ..|> Payable
Invoice "1" *-- "1..*" LineItem : contains >
Customer "1" o-- "0..*" Invoice : owns
Invoice --> Status
@enduml`,
  activity: `@startuml
title Pull request workflow
start
:Open pull request;
:Run CI checks;
if (Checks pass?) then (yes)
  fork
    :Request review;
  fork again
    :Deploy preview;
  end fork
  while (Changes requested?) is (yes)
    :Push fixes;
    :Re-run CI;
  endwhile (no)
  :Squash and merge;
elseif (Flaky test?) then (retry)
  :Re-run failed job;
else (no)
  :Fix the build;
  note right: CI logs are linked\\nfrom the PR
endif
partition Release {
  :Tag version;
  :Publish changelog;
}
stop
@enduml`,
  state: `@startuml
[*] --> Idle
Idle --> Loading : fetch()
Loading --> Success : 200
Loading --> Failure : error
state Failure {
  [*] --> Retrying
  Retrying --> Retrying : backoff
  Retrying --> GaveUp : 3 attempts
}
Failure --> Loading : retry
Success --> Idle : reset
state Success : data cached
note right of Loading : shows a spinner
GaveUp --> [*]
@enduml`,
  usecase: `@startuml
left to right direction
actor Customer
actor "Support agent" as Agent
rectangle "Help desk" {
  usecase "Open ticket" as UC1
  usecase "Track status" as UC2
  usecase "Attach files" as UC3
  usecase "Resolve ticket" as UC4
}
Customer --> UC1
Customer --> UC2
UC1 .> UC3 : <<extend>>
Agent --> UC4
Agent --> UC2
@enduml`,
  component: `@startuml
title Deployment
cloud "CDN" as cdn
node "Kubernetes cluster" {
  component [Web frontend] as web
  component [API] as api
  queue "Jobs" as jobs
  component [Worker] as worker
}
database "PostgreSQL" as pg
storage "S3 bucket" as s3

cdn --> web : HTTPS
web --> api : REST
api --> pg
api ..> jobs : enqueue
jobs --> worker
worker --> s3 : uploads
@enduml`,
  mindmap: `@startmindmap
* Launch plan
** Product
*** Feature freeze
*** Beta feedback
** Marketing
*** Landing page
*** Launch post
**** Draft
**** Review
** Support
*** Docs
*** FAQ (top 20)
@endmindmap`,
  gantt: `@startgantt
Project starts 2026-10-05
saturday are closed
sunday are closed
-- Design --
[Research] lasts 5 days
then [Wireframes] lasts 4 days
-- Build --
[API] lasts 10 days and starts at [Wireframes]'s end
[Frontend] lasts 2 weeks and starts at [Wireframes]'s end
[Integration] lasts 3 days and starts at [Frontend]'s end
[Research] is 100% completed
[API] is 40% completed
-- Launch --
[Release] happens at [Integration]'s end
@endgantt`,
  er: `@startuml
entity customer {
  * id : bigint <<PK>>
  --
  * email : text <<UK>>
  name : text
}
entity "order" as ord {
  * id : bigint <<PK>>
  --
  * customer_id : bigint <<FK>>
  placed_at : timestamptz
  total : numeric
}
entity line_item {
  * order_id : bigint <<FK>>
  * sku : text <<FK>>
  qty : int
}
customer ||--o{ ord : places
ord ||--|{ line_item : contains
@enduml`,
};

/* ── specs ───────────────────────────────────────────────────────────── */

const mermaidTheme = { id: "theme", label: "Theme", type: "select" as const, choices: ["default", "neutral", "dark", "forest", "base"], default: "default" };
const mermaidLook = { id: "look", label: "Look", type: "segment" as const, choices: [["classic", "Classic"], ["handDrawn", "Hand-drawn"]] as [string, string][], default: "classic" };

async function mermaidRender(code: string, theme: string, look: string, name: string): Promise<{ svg?: string; notes: string[]; type?: string }> {
  const M = await import("./lib/mermaid");
  if (isNode) {
    const err = await M.checkMermaid(code);
    if (err) throw new ToolError(err);
    return { notes: ["Syntax checked. Rendering needs a browser."] };
  }
  const svg = await M.renderMermaid(code, { theme: theme as "default", look: look as "classic" });
  void name;
  return { svg, notes: [] };
}

function mermaidError(e: unknown, code: string): ToolError {
  const msg = String((e as Error)?.message ?? e).replace(/^Error:\s*/, "");
  const m = msg.match(/(?:Parse error on line|line) (\d+)/i);
  if (m) {
    const line = Number(m[1]);
    const text = code.split("\n")[line - 1];
    if (text !== undefined && !msg.includes(text.trim())) return new ToolError(`${msg}\n\n  ${line} | ${text}`);
  }
  if (/No diagram type detected/i.test(msg)) return new ToolError(`${msg}\nThe first line must name the diagram: flowchart TD, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap…`);
  return new ToolError(msg);
}

const specs: SpecModule = {
  "graphviz-editor": {
    inputs: [{ id: "dot", label: "DOT", lang: "dot", placeholder: "digraph G { a -> b }" }],
    options: [
      { id: "engine", label: "Engine", type: "select", choices: [["dot", "dot (layered)"], ["neato", "neato (spring)"], ["fdp", "fdp (force)"], ["sfdp", "sfdp (large graphs)"], ["circo", "circo (circular)"], ["twopi", "twopi (radial)"], ["osage", "osage (clusters)"], ["patchwork", "patchwork (treemap)"]], default: "dot", hint: "A layout= attribute in the graph wins over this" },
      { id: "rankdir", label: "Direction", type: "select", choices: [["auto", "As written"], ["TB", "Top → bottom"], ["LR", "Left → right"], ["BT", "Bottom → top"], ["RL", "Right → left"]], default: "auto", hint: "Overrides rankdir (dot engine)" },
      { id: "theme", label: "Style", type: "select", choices: [["none", "As written"], ["modern", "Modern"], ["dark", "Dark"], ["sketch", "Sketch"], ["mono", "Monochrome"]], default: "none", hint: "Default node/edge attributes; explicit attributes still win" },
      { id: "format", label: "Text output", type: "select", choices: [["svg", "SVG"], ["dot", "DOT with layout"], ["canon", "Canonical DOT"], ["plain", "Plain (coordinates)"], ["json", "JSON"]], default: "svg" },
    ],
    outLang: "xml",
    async run({ inputs, opts }) {
      const src = str(inputs.dot);
      if (!src.trim()) throw new ToolError("Write some DOT — for example: digraph { a -> b }");
      const gv = await graphviz();
      const theme = str(opts.theme, "none"), rankdir = str(opts.rankdir, "auto");
      const code = decorate(src, theme, rankdir);
      const shift = theme !== "none" && THEMES[theme] ? THEMES[theme].split("\n").length + 1 : 0;
      const engine = str(opts.engine, "dot");
      let svg: string;
      try {
        svg = gv.layout(code, "svg", engine);
      } catch (e) {
        throw gvError(e, src, shift);
      }
      svg = svg.replace(/^<\?xml[^>]*>\s*/, "").replace(/<!DOCTYPE[^>]*>\s*/, "");
      const fmt = str(opts.format, "svg");
      let text = svg;
      let lang: "xml" | "dot" | "json" | "text" = "xml";
      if (fmt !== "svg") {
        text = gv.layout(code, fmt, engine);
        lang = fmt === "json" ? "json" : fmt === "plain" ? "text" : "dot";
        if (fmt === "json") text = JSON.stringify(JSON.parse(text), null, 2);
      }
      let stats: View | null = null;
      try {
        const j = JSON.parse(gv.layout(code, "json", engine)) as { objects?: { nodes?: number[]; name?: string }[]; edges?: unknown[]; bb?: string; directed?: boolean };
        const objs = j.objects ?? [];
        const clusters = objs.filter((o) => Array.isArray(o.nodes)).length;
        const bb = (j.bb ?? "0,0,0,0").split(",").map(Number);
        stats = {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Nodes", value: objs.length - clusters },
              { label: "Edges", value: j.edges?.length ?? 0 },
              { label: "Clusters / subgraphs", value: clusters },
              { label: "Directed", value: j.directed ? "yes" : "no" },
              { label: "Canvas (pt)", value: `${Math.round(bb[2])}×${Math.round(bb[3])}` },
              { label: "Engine", value: engine, tone: "info" },
              { label: "Graphviz", value: gv.version() },
            ],
          },
        };
      } catch {
        /* stats are optional */
      }
      const views: View[] = [{ label: "Diagram", out: { kind: "svg", svg, name: "graph" } }];
      if (fmt !== "svg") views.push({ label: fmt === "json" ? "JSON" : fmt === "plain" ? "Plain" : "DOT", out: { kind: "text", text, lang } });
      views.push({ label: "SVG source", out: { kind: "text", text: svg, lang: "xml" } });
      if (theme !== "none" || rankdir !== "auto") views.push({ label: "Effective DOT", out: { kind: "text", text: code, lang: "dot" } });
      if (stats) views.push(stats);
      const res: Result = { text, views, filename: fmt === "svg" ? "graph.svg" : fmt === "json" ? "graph.json" : "graph.dot" };
      if (/layout\s*=/.test(src) && engine !== "dot") res.notes = ["The graph sets layout= itself, which overrides the Engine option."];
      return res;
    },
    examples: [
      { label: "Microservices", inputs: { dot: DOT_MICRO }, note: "Clusters group services by domain; dashed edges are async events." },
      { label: "State machine", inputs: { dot: DOT_STATE }, note: "Circles, a point start node and a doublecircle final state." },
      { label: "DB schema (HTML labels)", inputs: { dot: DOT_SCHEMA }, note: "HTML-like table labels with ports: edges attach to specific rows." },
      { label: "Org chart", inputs: { dot: DOT_ORG }, opts: { theme: "modern" }, note: "rank=same aligns peers; orthogonal splines; the Modern style restyles it." },
      { label: "Network (neato)", inputs: { dot: DOT_NETWORK }, opts: { engine: "neato" }, note: "An undirected graph laid out by springs; len= sets preferred edge length." },
      { label: "Skills (twopi)", inputs: { dot: DOT_RADIAL }, opts: { engine: "twopi" }, note: "Radial layout around a root node." },
      { label: "Dependencies", inputs: { dot: DOT_DEPS }, note: "rankdir=BT puts the app on top; the red edges highlight a cycle." },
      { label: "Flowchart, left→right", inputs: { dot: DOT_FLOW }, opts: { rankdir: "LR" }, note: "Shapes and colours for a checkout flow; the Direction option turns it sideways." },
      { label: "As JSON", inputs: { dot: DOT_STATE }, opts: { format: "json" }, note: "The laid-out graph as JSON: positions, bounding boxes and draw ops." },
      { label: "Syntax error", inputs: { dot: "digraph {\n  a -> b\n  b -> [label=\"oops\"]\n}" }, error: true, note: "Graphviz reports the line; the error shows it." },
    ],
    steps: ["Write DOT on the left (or pick an example).", "Choose a layout engine and optional direction/style overrides.", "Zoom the diagram; download SVG or PNG from the Diagram tab.", "Switch the text output to JSON or plain coordinates for further processing."],
    tips: ["dot suits hierarchies; neato/fdp suit networks; circo/twopi suit cycles and radial trees.", "HTML-like labels (label=<...>) build tables — great for database schemas."],
  },

  "mermaid-playground": {
    inputs: [{ id: "code", label: "Mermaid", lang: "mermaid", placeholder: "flowchart TD\n  A --> B" }],
    options: [mermaidTheme, mermaidLook],
    outLang: "xml",
    async run({ inputs, opts }) {
      const code = str(inputs.code);
      if (!code.trim()) throw new ToolError("Write a Mermaid diagram — start with a type such as flowchart TD.");
      let r: { svg?: string; notes: string[] };
      try {
        r = await mermaidRender(code, str(opts.theme), str(opts.look), "diagram");
      } catch (e) {
        throw mermaidError(e, code);
      }
      const type = code.trim().split(/\s|\n/)[0];
      if (!r.svg) return { text: code, notes: r.notes, views: [{ label: "Source", out: { kind: "text", text: code, lang: "mermaid" } }] };
      return {
        text: r.svg,
        filename: "diagram.svg",
        views: [
          { label: "Diagram", out: { kind: "svg", svg: r.svg, name: type || "diagram" } },
          { label: "SVG source", out: { kind: "text", text: r.svg, lang: "xml" } },
        ],
      };
    },
    skipNodeTest: false,
    examples: [
      { label: "Flowchart", inputs: { code: MMD.flowchart }, note: "Shapes, labelled edges, a subgraph, classDef and style." },
      { label: "Sequence", inputs: { code: MMD.sequence }, note: "Autonumbering, activations (+/-), alt/else, loop, async arrows and notes." },
      { label: "Class", inputs: { code: MMD.class }, note: "Abstract classes, interfaces, generics (~T~), inheritance and aggregation with multiplicity." },
      { label: "State", inputs: { code: MMD.state }, note: "Composite states, start/end markers and a note." },
      { label: "ER", inputs: { code: MMD.er }, note: "Crow's-foot cardinalities and typed attributes with PK/FK/UK." },
      { label: "Gantt", inputs: { code: MMD.gantt }, opts: { theme: "neutral" }, note: "Sections, dependencies (after), done/active/crit tasks and a milestone." },
      { label: "Pie", inputs: { code: MMD.pie }, note: "showData prints the raw values next to the legend." },
      { label: "User journey", inputs: { code: MMD.journey }, note: "Scores 1–5 per step and who is involved." },
      { label: "Git graph", inputs: { code: MMD.git }, opts: { theme: "forest" }, note: "Branches, merges, tags and a highlighted commit." },
      { label: "Mindmap", inputs: { code: MMD.mindmap }, note: "Hierarchy by indentation; the root has a circle shape." },
      { label: "Timeline", inputs: { code: MMD.timeline }, note: "Several events per period with ' : '." },
      { label: "Quadrant", inputs: { code: MMD.quadrant }, note: "Points placed on two axes from 0 to 1." },
      { label: "Sankey", inputs: { code: MMD.sankey }, note: "CSV rows of source, target, value." },
      { label: "XY chart", inputs: { code: MMD.xychart }, note: "Bar and line series on shared axes." },
      { label: "Block", inputs: { code: MMD.block }, note: "A grid of blocks with column spans and arrows." },
      { label: "Architecture", inputs: { code: MMD.architecture }, note: "Services with built-in icons inside a group; edges pick sides (L/R/T/B)." },
      { label: "Hand-drawn", inputs: { code: MMD.flowchart }, opts: { look: "handDrawn", theme: "neutral" }, note: "The same flowchart with the sketchy hand-drawn look." },
      { label: "Syntax error", inputs: { code: MMD.broken }, error: true, note: "An unclosed { shape — Mermaid points at the line." },
    ],
    steps: ["Write Mermaid on the left, or pick one of the diagram types above.", "Change theme and look; the diagram re-renders as you type.", "Download SVG or PNG from the Diagram tab, or copy the SVG source."],
    tips: ["Everything renders locally with a bundled Mermaid — nothing is sent to a server.", "Use %% for comments."],
  },

  "plantuml-lite": {
    inputs: [{ id: "puml", label: "PlantUML", lang: "plantuml", placeholder: "@startuml\nAlice -> Bob : hello\n@enduml" }],
    options: [mermaidTheme, mermaidLook],
    outLang: "mermaid",
    async run({ inputs, opts }) {
      const src = str(inputs.puml);
      const { plantumlToMermaid, encodePlantUml } = await import("./lib/F-plantuml");
      const t = plantumlToMermaid(src);
      const enc = await encodePlantUml(src);
      const views: View[] = [];
      const notes: string[] = [];
      let svg: string | undefined;
      try {
        const r = await mermaidRender(t.mermaid, str(opts.theme), str(opts.look), t.kind);
        svg = r.svg;
        notes.push(...r.notes);
      } catch (e) {
        const err = mermaidError(e, t.mermaid);
        if (!isNode) notes.push(`The translated Mermaid did not render: ${err.message.split("\n")[0]}`);
        else throw new ToolError(`Translated Mermaid is invalid: ${err.message}`);
      }
      if (svg) views.push({ label: "Diagram", out: { kind: "svg", svg, name: t.kind } });
      views.push({ label: "Mermaid", out: { kind: "text", text: t.mermaid, lang: "mermaid" } });
      views.push({
        label: `Warnings (${t.warnings.length})`,
        out: { kind: "issues", items: t.warnings.map((w) => ({ level: /ignored|approximated|not shown|flattened|drawn as|shown as|using/i.test(w.message) ? "info" : "warning", message: w.message, line: w.line || undefined })) },
      });
      views.push({
        label: "Encoded",
        out: {
          kind: "text",
          wrap: true,
          text: `${enc.encoded}\n\n# PlantUML text encoding (${enc.method === "deflate" ? "raw deflate + PlantUML base64" : "~h hex fallback"}), for use with your own PlantUML server —\n# e.g. https://your-plantuml-server/svg/<encoded>. Nothing is sent from this page.`,
        },
      });
      notes.push(`Detected ${/^[aeiou]/.test(t.kind) ? "an" : "a"} ${t.kind} diagram → Mermaid ${t.mermaid.split("\n").find((l) => !/^(---|title:)/.test(l))?.split(" ")[0]}.`);
      return { text: t.mermaid, views, notes, filename: "diagram.mmd" };
    },
    examples: [
      { label: "Sequence", inputs: { puml: PUML.sequence }, note: "Participants with aliases, ++/-- activations, alt/else, loop, notes, autonumber and a == separator ==." },
      { label: "Class", inputs: { puml: PUML.class }, note: "A package, abstract/enum/interface, typed members, {static}/{abstract}, multiplicities and labels." },
      { label: "Activity", inputs: { puml: PUML.activity }, note: "if/elseif/else, fork, while, a note and a partition become a Mermaid flowchart." },
      { label: "State", inputs: { puml: PUML.state }, note: "[*] markers, a composite state, descriptions and a note." },
      { label: "Use case", inputs: { puml: PUML.usecase }, note: "Actors and use cases inside a system boundary; <<extend>> as a dotted link." },
      { label: "Deployment", inputs: { puml: PUML.component }, note: "Cloud, node, components, queue, database and storage shapes with labelled links." },
      { label: "Mindmap", inputs: { puml: PUML.mindmap }, note: "@startmindmap with * levels." },
      { label: "Gantt", inputs: { puml: PUML.gantt }, note: "Project start, closed weekends, then/starts-at dependencies, completion and a milestone." },
      { label: "ER (IE notation)", inputs: { puml: PUML.er }, note: "Entities with PK/FK markers and crow's-foot relations." },
      { label: "Unsupported type", inputs: { puml: "@startjson\n{\"a\": 1}\n@endjson" }, error: true, note: "JSON, YAML, salt and ditaa diagrams have no Mermaid equivalent." },
    ],
    steps: ["Paste PlantUML (with or without @startuml).", "Read the Diagram, rendered by Mermaid in your browser.", "Check Warnings for anything that was approximated or skipped.", "Copy the Mermaid source, or the encoded text for your own PlantUML server."],
    tips: ["skinparam, !theme and !include are ignored with a note — nothing is ever fetched.", "The Mermaid output is the pipeline payload, so you can chain it into other tools."],
  },
};

export default specs;
