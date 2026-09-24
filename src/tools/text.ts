import { ToolError, bool, num, str, type Opts, type Result, type SpecModule, type View } from "./types";

/* ── lazy helpers ────────────────────────────────────────────────────── */

const util = () => import("./lib/C-util");
const plug = <T,>(m: T) => ((m as { default?: T }).default ?? m) as never;

type PrettierErr = Error & { loc?: { start?: { line: number; column: number } } };

async function prettierFormat(src: string, parser: string, extra: Record<string, unknown>): Promise<string> {
  const prettier = await import("prettier/standalone");
  const plugins: unknown[] = [];
  if (parser === "css" || parser === "scss" || parser === "less") plugins.push(plug(await import("prettier/plugins/postcss")));
  else if (parser === "html") plugins.push(plug(await import("prettier/plugins/html")), plug(await import("prettier/plugins/postcss")), plug(await import("prettier/plugins/babel")), plug(await import("prettier/plugins/estree")));
  else {
    plugins.push(plug(await import("prettier/plugins/estree")));
    if (parser === "typescript") plugins.push(plug(await import("prettier/plugins/typescript")));
    else if (parser === "flow") plugins.push(plug(await import("prettier/plugins/flow")));
    else plugins.push(plug(await import("prettier/plugins/babel")));
  }
  try {
    return await prettier.format(src, { parser, plugins: plugins as never[], ...extra });
  } catch (e) {
    const err = e as PrettierErr;
    const first = (err.message || String(e)).split("\n")[0].replace(/\s*\(\d+:\d+\)$/, "").replace(/^CssSyntaxError:\s*/, "");
    const loc = err.loc?.start;
    if (loc) {
      const { codeFrame } = await util();
      throw new ToolError(`Syntax error: ${first}\nLine ${loc.line}, column ${loc.column}\n\n${codeFrame(src, loc.line, loc.column)}`);
    }
    throw new ToolError(`Could not format: ${first}`);
  }
}

async function sizeStats(before: string, after: string, extra: { label: string; value: string | number; tone?: "ok" | "warn" | "bad" | "info" }[] = []): Promise<View> {
  const { utf8Bytes, savings, fmtBytes } = await util();
  const a = utf8Bytes(before), b = utf8Bytes(after);
  return {
    label: "Stats",
    out: {
      kind: "stats",
      items: [
        { label: "Before", value: fmtBytes(a) },
        { label: "After", value: fmtBytes(b), tone: "info" },
        { label: "Change", value: savings(a, b), tone: b <= a ? "ok" : "warn" },
        { label: "Lines before", value: before.split("\n").length },
        { label: "Lines after", value: after.split("\n").length },
        ...extra,
      ],
    },
  };
}

const isFormat = (o: Opts) => str(o.mode) !== "minify";
const isMinify = (o: Opts) => str(o.mode) === "minify";
const indentChoices: [string, string][] = [["2", "2"], ["4", "4"], ["tab", "Tab"]];

/* ── CSS examples ────────────────────────────────────────────────────── */

const CSS_MIN = `:root{--brand:#0088b0;--radius:8px}*,*::before,*::after{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#222222}.btn{display:inline-flex;align-items:center;gap:.5rem;padding:0.5rem 1rem;border:1px solid transparent;border-radius:var(--radius);background:var(--brand);color:#FFFFFF;transition:background .15s ease-in-out,box-shadow .15s}.btn:hover,.btn:focus-visible{background:#006a8a;box-shadow:0 0 0 3px rgba(0,136,176,.25)}@media (max-width:640px){.btn{width:100%;justify-content:center}}`;

const SCSS = `// Card component
$radius: 12px;
$shadow: 0 1px 2px rgba(0,0,0,.08), 0 8px 24px rgba(0,0,0,.06);
@mixin elevated($level: 1) { box-shadow: $shadow; z-index: $level; }
.card{border-radius:$radius;@include elevated(2);
  &__title{font-size:1.25rem;margin:0 0 .5rem;&:hover{text-decoration:underline}}
  &--compact{padding:8px 12px}
  @media (prefers-color-scheme: dark){background:#1b1b1f;color:#eee}
}`;

const LESS = `@primary: #428bca;@padding: 10px;
.bordered(@width: 2px) { border: @width solid darken(@primary, 10%); }
#header { .navigation { font-size: 12px; a { color: @primary; &:hover { color: lighten(@primary, 20%) } } }
  .logo:extend(.banner) { width: 300px; .bordered(4px); padding: @padding (@padding * 2) } }`;

const CSS_MESSY = `/*! Theme v2.3 | MIT License */
/* ==== layout ==== */
.container   {
    max-width : 1200px ;
    margin: 0px auto;
    padding: 0.0em 1.50rem;
}


.grid { display:grid; grid-template-columns: repeat( auto-fill , minmax( 240px , 1fr ) ); gap : 24px }
.hero h1 , .hero h2{ font-weight: bold; color: #AABBCC; margin-top: 0.5em;;}
.empty-rule { }
.w { width: calc(100% - 2 * 16px); transform: translate(0px, -0.5px) }
@media screen and (min-width: 768px) { .grid { gap: 32px; } }`;

/* ── HTML examples ───────────────────────────────────────────────────── */

const HTML_PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acme — Pricing</title><style>body{font-family:system-ui;margin:0}.plans{display:flex;gap:16px;padding:24px}.plan{flex:1;border:1px solid #ddd;border-radius:12px;padding:16px}</style></head><body><header class="site-header"><nav><a href="/" class="logo">Acme</a><ul><li><a href="/features">Features</a></li><li><a href="/pricing" aria-current="page">Pricing</a></li></ul></nav></header><main><section class="plans"><article class="plan"><h2>Starter</h2><p class="price"><strong>$0</strong> / month</p><ul><li>1 project</li><li>Community support</li></ul><button type="button" class="btn">Get started</button></article><article class="plan featured"><h2>Pro</h2><p class="price"><strong>$12</strong> / month</p><ul><li>Unlimited projects</li><li>Priority support</li></ul><button type="button" class="btn btn-primary">Upgrade</button></article></section></main><!-- analytics goes here --><footer><p>&copy; 2026 Acme Inc.</p></footer></body></html>`;

const HTML_FORM = `<form action="/signup" method="post" class="signup" novalidate><label for="email">Email</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><label for="plan">Plan</label><select id="plan" name="plan"><option value="free">Free</option><option value="pro" selected>Pro</option></select><label><input type="checkbox" name="tos" required> I agree to the <a href="/terms" target="_blank" rel="noopener">terms</a></label><button type="submit" class="btn btn-primary" data-track="signup-submit">Create account</button></form>`;

const HTML_PRE = `<article>
    <h1>Using   <code>fetch</code></h1>
    <p>
        Call it   like   this —   whitespace in <em>inline</em>   text collapses:
    </p>
    <pre><code>const res = await fetch("/api/users");
if (!res.ok)   throw new Error(res.statusText);
</code></pre>
    <!-- TODO: add error handling section -->
    <textarea name="notes">  keep
    this   exactly  </textarea>
</article>`;

const HTML_TABLE = `<table class="data"><caption>Q3 revenue</caption><thead><tr><th scope="col">Region</th><th scope="col">Revenue</th><th scope="col">Growth</th></tr></thead><tbody><tr><td>EMEA</td><td>$1.2M</td><td class="up">+12%</td></tr><tr><td>APAC</td><td>$0.8M</td><td class="up">+31%</td></tr><tr><td>Americas</td><td>$2.4M</td><td class="down">−3%</td></tr></tbody></table>`;

/* ── JS examples ─────────────────────────────────────────────────────── */

const JS_MIN = `import{useEffect,useState}from"react";export function useDebounced(value,delay=300){const[v,setV]=useState(value);useEffect(()=>{const t=setTimeout(()=>setV(value),delay);return()=>clearTimeout(t)},[value,delay]);return v}const api={async get(url,{signal,headers={}}={}){const res=await fetch(url,{signal,headers:{Accept:"application/json",...headers}});if(!res.ok)throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);return res.json()}};export default api;`;

const TS_SRC = `interface Repository<T extends {id:string}>{findById(id:string):Promise<T|undefined>;save(entity:T):Promise<void>}
type User={id:string;name:string;roles:readonly ('admin'|'editor'|'viewer')[];createdAt:Date}
export class InMemoryRepo<T extends {id:string}> implements Repository<T>{private items=new Map<string,T>();constructor(private readonly clock:()=>Date=()=>new Date()){}
async findById(id:string){return this.items.get(id)}
async save(entity:T){this.items.set(entity.id,entity)}}
export const isAdmin=(u:User):boolean=>u.roles.includes('admin')
export enum Status{Active='active',Suspended='suspended'}`;

const JSX_SRC = `export default function TodoList({todos,onToggle,filter='all'}){const visible=todos.filter(t=>filter==='all'||(filter==='done'?t.done:!t.done));if(!visible.length)return <p className="empty">Nothing to do 🎉</p>;return <ul className="todos">{visible.map(t=><li key={t.id} className={t.done?'done':undefined}><label><input type="checkbox" checked={t.done} onChange={()=>onToggle(t.id)}/> {t.title}</label></li>)}</ul>}`;

const FLOW_SRC = `// @flow
type Point = {| x: number, y: number |};
function distance(a: Point, b: Point): number { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx*dx + dy*dy) }
export function centroid(points: $ReadOnlyArray<Point>): ?Point { if (points.length === 0) return null; const sum = points.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}), {x: 0, y: 0}); return {x: sum.x / points.length, y: sum.y / points.length} }`;

/* ── SQL examples ────────────────────────────────────────────────────── */

const SQL_REPORT = `with monthly as (select date_trunc('month', o.created_at) as order_month, c.region, sum(oi.quantity * oi.unit_price) as revenue, count(distinct o.id) as orders from orders o join customers c on c.id = o.customer_id join order_items oi on oi.order_id = o.id where o.status in ('paid','shipped') and o.created_at >= now() - interval '12 months' group by 1, 2) select order_month, region, revenue, orders, round(100.0 * (revenue - lag(revenue) over (partition by region order by month)) / nullif(lag(revenue) over (partition by region order by month), 0), 1) as growth_pct, rank() over (partition by order_month order by revenue desc) as region_rank from monthly where revenue > 1000 order by order_month desc, region_rank;`;

const SQL_MYSQL = `INSERT INTO \`users\` (\`email\`,\`name\`,\`created_at\`) VALUES ('ada@example.com','Ada Lovelace',NOW()),('grace@example.com','Grace Hopper',NOW()) ON DUPLICATE KEY UPDATE \`name\`=VALUES(\`name\`); UPDATE \`users\` SET \`last_login\`=NOW() WHERE \`email\`='ada@example.com' LIMIT 1; SELECT u.id, u.email, COUNT(s.id) AS sessions FROM users u LEFT JOIN sessions s ON s.user_id=u.id GROUP BY u.id HAVING sessions>3;`;

const SQL_TSQL = `SELECT TOP (10) [p].[ProductID], [p].[Name], SUM([d].[OrderQty]) AS [Units], CAST(SUM([d].[LineTotal]) AS DECIMAL(12,2)) AS [Revenue] FROM [Sales].[SalesOrderDetail] AS [d] INNER JOIN [Production].[Product] AS [p] ON [p].[ProductID] = [d].[ProductID] WHERE [d].[ModifiedDate] >= DATEADD(MONTH, -6, GETDATE()) AND [p].[Color] IS NOT NULL GROUP BY [p].[ProductID], [p].[Name] ORDER BY [Revenue] DESC;`;

const SQL_PG = `select id, payload->>'event' as event, (payload->'user'->>'id')::bigint as user_id, created_at::date from events where payload @> '{"source":"web"}'::jsonb and created_at between $1 and $2 order by created_at desc limit 50; create index concurrently if not exists events_payload_gin on events using gin (payload jsonb_path_ops);`;

const SQL_BQ = "SELECT user.country, APPROX_COUNT_DISTINCT(user_pseudo_id) AS users, ARRAY_AGG(STRUCT(event_name, event_timestamp) ORDER BY event_timestamp DESC LIMIT 3) AS last_events FROM `my-project.analytics_123.events_*`, UNNEST(event_params) AS p WHERE _TABLE_SUFFIX BETWEEN '20260901' AND '20260924' AND p.key = 'page_location' GROUP BY 1 ORDER BY users DESC";

const SQL_COMMENTED = `-- Active customers with open tickets
SELECT   c.id,
         c.name,        /* display name */
         COUNT(t.id)  AS open_tickets
FROM     customers c
JOIN     tickets   t ON t.customer_id = c.id
WHERE    t.status = 'open'   -- not 'closed'
  AND    c.name <> 'O''Brien -- test'
GROUP BY c.id, c.name
ORDER BY open_tickets DESC;`;

const SQL_LANGS: [string, string][] = [
  ["sql", "Standard SQL"], ["postgresql", "PostgreSQL"], ["mysql", "MySQL"], ["mariadb", "MariaDB"], ["sqlite", "SQLite"], ["bigquery", "BigQuery"], ["snowflake", "Snowflake"], ["redshift", "Redshift"],
  ["transactsql", "SQL Server (T-SQL)"], ["plsql", "Oracle PL/SQL"], ["db2", "DB2"], ["db2i", "DB2 for i"], ["spark", "Spark SQL"], ["trino", "Trino / Presto"], ["hive", "Hive"], ["n1ql", "Couchbase N1QL"], ["singlestoredb", "SingleStore"], ["duckdb", "DuckDB"], ["clickhouse", "ClickHouse"], ["tidb", "TiDB"],
];
const CASE3: [string, string][] = [["preserve", "Keep"], ["upper", "UPPER"], ["lower", "lower"]];

/* ── stack trace examples ────────────────────────────────────────────── */

const NODE_TRACE = `TypeError: Cannot read properties of undefined (reading 'map')
    at renderOrders (/Users/ada/dev/shop/src/views/orders.js:42:27)
    at OrderController.list (/Users/ada/dev/shop/src/controllers/order-controller.js:18:12)
    at Layer.handle [as handle_request] (/Users/ada/dev/shop/node_modules/express/lib/router/layer.js:95:5)
    at next (/Users/ada/dev/shop/node_modules/express/lib/router/route.js:149:13)
    at Route.dispatch (/Users/ada/dev/shop/node_modules/express/lib/router/route.js:119:3)
    at /Users/ada/dev/shop/node_modules/express/lib/router/index.js:284:15
    at async Promise.all (index 0)
    at async loadDashboard (/Users/ada/dev/shop/src/services/dashboard.js:9:19)
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)`;

const CHROME_TRACE = `Uncaught TypeError: Cannot destructure property 'user' of 'undefined' as it is undefined.
    at ProfileCard (webpack-internal:///./src/components/ProfileCard.tsx:14:11)
    at renderWithHooks (webpack-internal:///./node_modules/react-dom/cjs/react-dom.development.js:16305:18)
    at mountIndeterminateComponent (webpack-internal:///./node_modules/react-dom/cjs/react-dom.development.js:20074:13)
    at beginWork (webpack-internal:///./node_modules/react-dom/cjs/react-dom.development.js:21587:16)
    at HTMLUnknownElement.callCallback (webpack:///./node_modules/react-dom/cjs/react-dom.development.js?61bb:4164:14)
    at useProfile (webpack:///./src/hooks/useProfile.ts?a1b2:22:9)
    at chrome-extension://fmkadmapgofadopljbjfkapdkoienihi/build/installHook.js:1:38472`;

const FIREFOX_TRACE = `Error: Request failed with status 502
fetchJson@http://localhost:5173/src/lib/http.ts?t=1727170000:12:11
async*loadInvoices@http://localhost:5173/src/pages/Invoices.tsx:31:24
Invoices/<@http://localhost:5173/src/pages/Invoices.tsx:18:5
commitHookEffectListMount@http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=9f2a1c:16915:34
@moz-extension://2c127fa4-62c7-7e4f-90e5-472b45eecfdc/content.js:3:1`;

const SAFARI_TRACE = `TypeError: undefined is not an object (evaluating 'cart.items.length')
updateBadge@https://shop.example.com/assets/app.3f9c2.js:1:48211
@https://shop.example.com/assets/app.3f9c2.js:1:50102
forEach@[native code]
dispatch@https://shop.example.com/assets/vendor.81aa0.js:2:10244
global code@https://shop.example.com/checkout:88:17`;

const REACT_STACK = `Warning: Each child in a list should have a unique "key" prop.

Check the render method of \`OrderTable\`. See https://reactjs.org/link/warning-keys for more information.
    in OrderRow (at OrderTable.js:27)
    in tbody (at OrderTable.js:24)
    in table (at OrderTable.js:20)
    in OrderTable (at Dashboard.js:61)
    in div (created by Dashboard)
    in Dashboard (at App.js:15)
    in App (at index.js:9)`;

const CAUSE_TRACE = `Error: Failed to load user settings
    at loadSettings (file:///srv/app/dist/settings.js:31:11)
    at async bootstrap (file:///srv/app/dist/main.js:12:3) {
  [cause]: SyntaxError: Unexpected token } in JSON at position 42
      at JSON.parse (<anonymous>)
      at parseConfig (file:///srv/app/dist/config.js:8:15)
      at loadSettings (file:///srv/app/dist/settings.js:27:20)
      at async bootstrap (file:///srv/app/dist/main.js:12:3)
}`;

/* ── Java examples ───────────────────────────────────────────────────── */

const JAVA_SPRING = `org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'orderService' defined in file [/app/classes/com/example/shop/OrderService.class]: Failed to instantiate [com.example.shop.OrderService]: Constructor threw exception
	at org.springframework.beans.factory.support.ConstructorResolver.instantiate(ConstructorResolver.java:318)
	at org.springframework.beans.factory.support.ConstructorResolver.autowireConstructor(ConstructorResolver.java:296)
	at org.springframework.beans.factory.support.AbstractAutowireCapableBeanFactory.createBeanInstance(AbstractAutowireCapableBeanFactory.java:1375)
	at org.springframework.beans.factory.support.AbstractBeanFactory.getBean(AbstractBeanFactory.java:208)
	at org.springframework.boot.SpringApplication.run(SpringApplication.java:335)
	at com.example.shop.ShopApplication.main(ShopApplication.java:12)
Caused by: java.lang.IllegalStateException: Could not connect to payment gateway
	at com.example.shop.payments.GatewayClient.connect(GatewayClient.java:88)
	at com.example.shop.OrderService.<init>(OrderService.java:34)
	at java.base/jdk.internal.reflect.DirectConstructorHandleAccessor.newInstance(DirectConstructorHandleAccessor.java:62)
	at java.base/java.lang.reflect.Constructor.newInstanceWithCaller(Constructor.java:502)
	at org.springframework.beans.BeanUtils.instantiateClass(BeanUtils.java:195)
	... 4 common frames omitted
Caused by: java.net.ConnectException: Connection refused
	at java.base/sun.nio.ch.Net.pollConnect(Native Method)
	at java.base/sun.nio.ch.NioSocketImpl.timedFinishConnect(NioSocketImpl.java:554)
	at java.base/java.net.Socket.connect(Socket.java:751)
	at org.apache.http.conn.socket.PlainConnectionSocketFactory.connectSocket(PlainConnectionSocketFactory.java:75)
	at com.example.shop.payments.GatewayClient.connect(GatewayClient.java:81)
	... 8 common frames omitted`;

const JAVA_NPE = `Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "name" is null
	at com.example.util.Names.initials(Names.java:17)
	at com.example.util.Names.lambda$format$0(Names.java:9)
	at java.base/java.util.stream.ReferencePipeline$3$1.accept(ReferencePipeline.java:197)
	at java.base/java.util.ArrayList$ArrayListSpliterator.forEachRemaining(ArrayList.java:1708)
	at java.base/java.util.stream.AbstractPipeline.copyInto(AbstractPipeline.java:509)
	at java.base/java.util.stream.ReferencePipeline.collect(ReferencePipeline.java:682)
	at com.example.util.Names.format(Names.java:10)
	at com.example.App.main(App.java:6)`;

const JAVA_FLAT = `2026-09-24 10:15:03.412 ERROR 4121 --- [nio-8080-exec-7] o.a.c.c.C.[.[.[/].[dispatcherServlet]    : Servlet.service() threw exception\\njava.lang.ArithmeticException: / by zero\\n\\tat com.example.api.StatsController.average(StatsController.java:44)\\n\\tat java.base/jdk.internal.reflect.DirectMethodHandleAccessor.invoke(DirectMethodHandleAccessor.java:103)\\n\\tat org.springframework.web.method.support.InvocableHandlerMethod.doInvoke(InvocableHandlerMethod.java:255)\\n\\tat org.springframework.web.servlet.FrameworkServlet.service(FrameworkServlet.java:885)\\n\\tat org.apache.catalina.core.ApplicationFilterChain.doFilter(ApplicationFilterChain.java:166)\\n\\tat java.base/java.lang.Thread.run(Thread.java:1583)`;

const JAVA_ONELINE = `WARN  [worker-3] c.e.jobs.ImportJob - Import failed java.io.UncheckedIOException: Failed to read /data/in/users.csv at com.example.jobs.CsvReader.read(CsvReader.java:52) at com.example.jobs.ImportJob.run(ImportJob.java:30) at java.base/java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1144) Caused by: java.nio.file.AccessDeniedException: /data/in/users.csv at java.base/sun.nio.fs.UnixException.translateToIOException(UnixException.java:90) at java.base/java.nio.file.Files.newBufferedReader(Files.java:2922) at com.example.jobs.CsvReader.read(CsvReader.java:49) ... 2 more`;

const JAVA_SUPPRESSED = `java.io.IOException: Failed to write report
	at com.example.report.ReportWriter.write(ReportWriter.java:40)
	at com.example.report.ReportJob.execute(ReportJob.java:22)
	at kotlinx.coroutines.DispatchedTask.run(DispatchedTask.kt:108)
	Suppressed: java.io.IOException: Stream closed
		at com.example.report.ZipSink.close(ZipSink.java:71)
		at com.example.report.ReportWriter.write(ReportWriter.java:38)
		... 2 more
	Suppressed: java.lang.IllegalStateException: Temp file still locked
		at com.example.report.TempFiles.delete(TempFiles.java:19)
		... 3 more
Caused by: java.nio.file.FileSystemException: /tmp/report-2026-09.zip: No space left on device
	at java.base/sun.nio.fs.UnixException.translateToIOException(UnixException.java:100)
	at java.base/sun.nio.fs.UnixChannelFactory.newFileChannel(UnixChannelFactory.java:181)
	at com.example.report.ZipSink.open(ZipSink.java:33)
	at com.example.report.ReportWriter.write(ReportWriter.java:35)
	... 2 more`;

/* ── Go examples ─────────────────────────────────────────────────────── */

const GO_NILMAP = `panic: assignment to entry in nil map

goroutine 1 [running]:
main.(*Registry).Register(...)
	/home/dev/registry/registry.go:18
main.main()
	/home/dev/registry/main.go:9 +0x45
exit status 2`;

const GO_INDEX = `panic: runtime error: index out of range [5] with length 3

goroutine 18 [running]:
github.com/acme/billing/internal/invoice.(*Builder).Line(0xc0000a4000, 0x5)
	/src/billing/internal/invoice/builder.go:57 +0x1d4
github.com/acme/billing/internal/invoice.Render({0xc000112000, 0x3, 0x4}, {0x6b2a31, 0x3})
	/src/billing/internal/invoice/render.go:22 +0x8e
net/http.HandlerFunc.ServeHTTP(0x0?, {0x7a1e40?, 0xc0001c2000?}, 0x0?)
	/usr/local/go/src/net/http/server.go:2171 +0x29
net/http.(*ServeMux).ServeHTTP(0x0?, {0x7a1e40, 0xc0001c2000}, 0xc0001b6000)
	/usr/local/go/src/net/http/server.go:2688 +0x1ad
net/http.serverHandler.ServeHTTP({0xc000180090?}, {0x7a1e40?, 0xc0001c2000?}, 0x6?)
	/usr/local/go/src/net/http/server.go:3142 +0x8e
net/http.(*conn).serve(0xc0001a4000, {0x7a2518, 0xc000180000})
	/usr/local/go/src/net/http/server.go:2044 +0x5e8
created by net/http.(*Server).Serve in goroutine 1
	/usr/local/go/src/net/http/server.go:3290 +0x4b4
exit status 2`;

const GO_DEADLOCK = `fatal error: all goroutines are asleep - deadlock!

goroutine 1 [chan receive]:
main.main()
	/home/dev/pipeline/main.go:31 +0x1a5

goroutine 6 [chan send]:
main.producer(0xc000062060, 0x64)
	/home/dev/pipeline/main.go:12 +0x6e
created by main.main in goroutine 1
	/home/dev/pipeline/main.go:26 +0x8f

goroutine 7 [sync.WaitGroup.Wait]:
sync.runtime_Semacquire(0xc000014098?)
	/usr/local/go/src/runtime/sema.go:62 +0x25
sync.(*WaitGroup).Wait(0xc000014090)
	/usr/local/go/src/sync/waitgroup.go:116 +0x48
main.closer(0xc000014090, 0xc0000620c0)
	/home/dev/pipeline/main.go:19 +0x2a
created by main.main in goroutine 1
	/home/dev/pipeline/main.go:28 +0x105
exit status 2`;

function manyGoroutines(): string {
  const parts = [`panic: shutdown timeout: 14 workers still busy

goroutine 1 [running]:
main.(*Pool).Shutdown(0xc0000b2000, {0x7c3d10, 0xc0000b8000})
	/app/pool/pool.go:88 +0x2f4
main.main()
	/app/cmd/server/main.go:54 +0x3c5`];
  for (let k = 0; k < 12; k++)
    parts.push(`goroutine ${20 + k} [chan receive, ${k < 8 ? 7 : 3} minutes]:
main.(*Pool).worker(0xc0000b2000, ${k})
	/app/pool/pool.go:41 +0x9c
created by main.NewPool in goroutine 1
	/app/pool/pool.go:30 +0x1b2`);
  parts.push(`goroutine 40 [select]:
net/http.(*persistConn).writeLoop(0xc000246000)
	/usr/local/go/src/net/http/transport.go:2421 +0xe5
created by net/http.(*Transport).dialConn in goroutine 22
	/usr/local/go/src/net/http/transport.go:1777 +0x16f1`);
  parts.push(`goroutine 41 [IO wait]:
internal/poll.runtime_pollWait(0x7f5a3c1e8e28, 0x72)
	/usr/local/go/src/runtime/netpoll.go:345 +0x85
internal/poll.(*FD).Read(0xc000250000, {0xc000260000, 0x1000, 0x1000})
	/usr/local/go/src/internal/poll/fd_unix.go:164 +0x27a
net/http.(*persistConn).readLoop(0xc000246000)
	/usr/local/go/src/net/http/transport.go:2205 +0x8f
created by net/http.(*Transport).dialConn in goroutine 22
	/usr/local/go/src/net/http/transport.go:1776 +0x169f`);
  for (let k = 0; k < 2; k++)
    parts.push(`goroutine ${50 + k} [semacquire, 7 minutes, locked to thread]:
sync.runtime_SemacquireMutex(0xc0000b2010?, 0x0?, 0x1?)
	/usr/local/go/src/runtime/sema.go:77 +0x25
sync.(*Mutex).lockSlow(0xc0000b2008)
	/usr/local/go/src/sync/mutex.go:171 +0x15d
main.(*Pool).report(0xc0000b2000)
	/app/pool/pool.go:102 +0x3b
created by main.(*Pool).Start in goroutine 1
	/app/pool/pool.go:65 +0x88`);
  return parts.join("\n\n") + "\nexit status 2";
}

const GO_CUSTOM = `panic: failed to load config: open /etc/billing/config.yaml: no such file or directory [recovered]
	panic: failed to load config: open /etc/billing/config.yaml: no such file or directory

goroutine 1 [running]:
main.main.func1()
	/src/billing/cmd/billing/main.go:19 +0x7c
panic({0x6a3f20?, 0xc000012345?})
	/usr/local/go/src/runtime/panic.go:785 +0x132
github.com/acme/billing/internal/config.MustLoad({0x6d1a2b, 0x1b})
	/src/billing/internal/config/config.go:44 +0x1f5
main.main()
	/src/billing/cmd/billing/main.go:23 +0x5d
exit status 2`;

const GO_NILPTR = `panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x18 pc=0x4a7c1e]

goroutine 33 [running]:
github.com/acme/api/internal/store.(*UserStore).Get(0x0, {0x7ff2d0, 0xc0000a6000}, 0x2a)
	/src/api/internal/store/users.go:61 +0x3e
github.com/acme/api/internal/handlers.GetUser.func1({0x7fe5a0, 0xc0000ee0e0}, 0xc000120000)
	/src/api/internal/handlers/users.go:28 +0xd1
net/http.HandlerFunc.ServeHTTP(0xc000110000?, {0x7fe5a0?, 0xc0000ee0e0?}, 0x4f5d8a?)
	/usr/local/go/src/net/http/server.go:2171 +0x29
created by net/http.(*Server).Serve in goroutine 1
	/usr/local/go/src/net/http/server.go:3290 +0x4b4`;

/* ── Text toolbox / logs / diff / markdown examples ─────────────────── */

const PROSE = `The quick brown fox jumps over the lazy dog. The dog, being lazy, did not react — it simply yawned.
Meanwhile the fox wrote a blog post titled "How I jumped over a dog (and you can too)" and sent it to editor@example.com and fox.tales@example.org.
Read it at https://blog.example.com/posts/fox-jump?ref=newsletter or mirror http://mirror.example.net/fox.
It got 1,204 likes, 87 shares and a 4.5 star rating from 312 reviewers. Server 192.168.1.20 and 2001:db8::8a2e:370:7334 served it.`;

const NAMES = `user id
First Name
last-name
emailAddress
HTTPResponseCode
date_of_birth
is  active flag`;

const FILES = `report-10.pdf
report-2.pdf
Report-1.pdf
image_20.png
image_3.png
report-2.pdf
notes.txt
Image_3.png`;

const CSV_ROWS = `id,name,email,country,plan
1,Ada Lovelace,ada@example.com,UK,pro
2,Grace Hopper,grace@example.com,US,team
3,Linus Torvalds,linus@example.org,FI,free
4,Margaret Hamilton,margaret@example.com,US,pro`;

function appLog(): string {
  const gh = "ghp_" + "Zx9".repeat(12);
  const stripe = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc";
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + ".eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSJ9" + ".dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  return `2026-09-24 10:15:01,112 INFO  [main] com.example.App - Starting service on host api-7f9c from 10.0.3.17
2026-09-24 10:15:02,450 DEBUG [http-1] com.example.auth.Filter - Authorization: Bearer ${jwt}
2026-09-24 10:15:02,451 INFO  [http-1] com.example.users.Api - Login ok for ada.lovelace@example.com (user 3f2b8c1e-9d4a-4b6f-8e21-7c5d9a0b1e22)
2026-09-24 10:15:03,007 WARN  [http-2] com.example.pay.Checkout - Card declined 4111 1111 1111 1111 for grace@example.com, retrying
2026-09-24 10:15:03,010 ERROR [http-2] com.example.pay.Stripe - Stripe call failed key=${stripe} status=402
java.lang.IllegalStateException: payment_required
	at com.example.pay.Stripe.charge(Stripe.java:88)
2026-09-24 10:15:04,220 INFO  [cron] com.example.sync.Github - Using token ${gh} for repo sync
2026-09-24 10:15:05,901 ERROR [http-3] com.example.db.Pool - Connection failed: postgres://app:S3cr3tP@ss@db.internal:5432/shop password=S3cr3tP@ss
2026-09-24 10:15:06,333 INFO  [http-4] com.example.users.Api - Updated profile phone=+1 415-555-0132 ssn=123-45-6789
2026-09-24 10:15:07,002 DEBUG [http-4] com.example.cache.Redis - cache hit users:42 in 3ms`;
}

function jsonLog(): string {
  const key = "AKIAIOSFODNN7EXAMPLE";
  return [
    { level: 30, time: 1727172901112, pid: 812, hostname: "web-1", name: "api", msg: "request completed", req: { method: "GET", url: "/v1/orders?customer=ada@example.com" }, res: { statusCode: 200 }, responseTime: 12 },
    { level: 40, time: 1727172902450, name: "api", msg: "slow query", sql: "select * from users where email = 'grace@example.com'", ms: 1840 },
    { level: 50, time: 1727172903007, name: "billing", msg: "upstream error", err: { type: "FetchError", message: "connect ECONNREFUSED 10.1.4.22:443" }, clientIp: "203.0.113.9" },
    { level: 30, time: 1727172904220, name: "config", msg: "loaded credentials", aws_access_key_id: key, password: "hunter2", api_key: "live-" + "9f8e7d6c5b4a" },
    { level: 20, time: 1727172905901, name: "api", msg: "cache stats", hits: 991, misses: 9 },
    { level: 50, time: 1727172906333, name: "api", msg: "user lookup failed for 3f2b8c1e-9d4a-4b6f-8e21-7c5d9a0b1e22", ip: "2001:db8:85a3::8a2e:370:7334" },
  ]
    .map((o) => JSON.stringify(o))
    .join("\n");
}

const NGINX_LOG = `203.0.113.9 - - [24/Sep/2026:10:15:01 +0000] "GET /api/v1/users?email=ada@example.com HTTP/1.1" 200 512 "-" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15"
198.51.100.23 - alice [24/Sep/2026:10:15:02 +0000] "POST /login HTTP/1.1" 302 0 "https://shop.example.com/login" "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
192.0.2.44 - - [24/Sep/2026:10:15:03 +0000] "GET /wp-admin/install.php HTTP/1.1" 404 162 "-" "sqlmap/1.8"
203.0.113.9 - - [24/Sep/2026:10:15:04 +0000] "GET /api/v1/orders/9f1c HTTP/1.1" 500 89 "-" "okhttp/4.12.0"
2001:db8::1 - - [24/Sep/2026:10:15:05 +0000] "GET /reset?token=abc123def456ghi789 HTTP/2.0" 200 1043 "-" "curl/8.7.1"`;

const SYSLOG = `<34>Sep 24 10:15:01 bastion sshd[2231]: Failed password for invalid user admin from 192.0.2.77 port 51022 ssh2
<38>Sep 24 10:15:04 bastion sshd[2231]: Accepted publickey for deploy from 10.0.0.12 port 50110 ssh2
<30>Sep 24 10:15:09 web-1 systemd[1]: Started nginx.service - A high performance web server.
<27>Sep 24 10:16:00 web-1 kernel: Out of memory: Killed process 4121 (java) total-vm:8123456kB
<165>1 2026-09-24T10:16:30.003Z db-2 postgres 991 - - connection authorized: user=app database=shop password=pa55w0rd`;

const LOGFMT = `time=2026-09-24T10:15:01Z level=info msg="server started" addr=:8080 version=2.3.0
time=2026-09-24T10:15:02Z level=debug msg="session created" user=ada@example.com session_id=9b2f0c1d4e5a6b7c
time=2026-09-24T10:15:03Z level=warn msg="rate limited" ip=198.51.100.23 path=/api/search
time=2026-09-24T10:15:04Z level=error msg="webhook failed" url=https://hooks.slack.com/services/T000/B000/XXXXXXXX err="context deadline exceeded"
time=2026-09-24T10:15:05Z level=info msg="payment ok" card=5500-0000-0000-0004 amount=42.50`;

const DIFF_A = `# Service configuration
server:
  host: 0.0.0.0
  port: 8080
  timeout: 30s
database:
  url: postgres://db.internal:5432/shop
  pool: 10
  ssl: false
features:
  - search
  - recommendations
logging:
  level: info`;

const DIFF_B = `# Service configuration
server:
  host: 0.0.0.0
  port: 9090
  timeout: 30s
database:
  url: postgres://db.internal:5432/shop
  pool: 25
  ssl: true
features:
  - search
  - recommendations
  - checkout-v2
logging:
  level: debug
  format: json`;

const CODE_A = `export function total(items) {
  let sum = 0;
  for (const item of items) {
    sum += item.price * item.qty;
  }
  return sum;
}

export function formatPrice(cents) {
  return "$" + (cents / 100).toFixed(2);
}`;

const CODE_B = `export function total(items, { taxRate = 0 } = {}) {
  const sum = items.reduce((acc, item) => acc + item.price * item.qty, 0);
  return Math.round(sum * (1 + taxRate));
}

export function formatPrice(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}`;

const README = `# Formatter

[![CI](https://img.shields.io/badge/ci-passing-brightgreen)](https://example.com/ci) ![License: MIT](https://img.shields.io/badge/license-MIT-blue)

**Formatter** is a collection of *offline-first* developer tools that run entirely in your browser — no uploads, no tracking.

## Features

- 120+ tools: JSON, XML, SQL, Base64, JWT, regex and more
- Pipelines that chain tools together
- Works offline after the first visit
- Share links that carry the input, not a copy on a server

## Quick start

\`\`\`bash
git clone https://github.com/example/formatter.git
cd formatter && npm install
npm run dev
\`\`\`

Open http://localhost:3100 and pick a tool.

## Configuration

| Variable      | Default | Description                      |
| ------------- | :-----: | -------------------------------- |
| \`PORT\`        | 3100    | Port for the dev server          |
| \`BASE_PATH\`   | \`/\`     | Serve the app from a sub-path    |
| \`ANALYTICS\`   | off     | There is none. It is always off. |

## Contributing

1. Fork the repo
2. Create a branch: \`git checkout -b feat/my-tool\`
3. Open a pull request

> **Note**
> Every tool must work without the network.
`;

const MD_TASKS = `## Launch checklist

- [x] Write the announcement post
- [x] Record the demo video
- [ ] Update pricing page
  - [x] New plan names
  - [ ] Annual discount copy
- [ ] Email the beta list
- [ ] ~~Print flyers~~ (cancelled)

### Blockers
1. Legal review of the terms
2. Final QA sign-off on **Safari 17**
`;

const MD_CODE = `# Fetching data

Use \`fetch\` with \`async\`/\`await\`:

\`\`\`js
async function getUser(id) {
  const res = await fetch(\`/api/users/\${id}\`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
\`\`\`

The same thing in Python:

\`\`\`python
import requests

def get_user(user_id: int) -> dict:
    r = requests.get(f"https://api.example.com/users/{user_id}", timeout=5)
    r.raise_for_status()
    return r.json()
\`\`\`

Indented code blocks work too:

    $ curl -s https://api.example.com/users/42 | jq .name
    "Ada"
`;

const MD_BLOG = `# Why we went offline-first

*September 24, 2026 · 6 min read*

Every tool on this site runs in your browser.[^1] That started as a privacy decision -- it turned into a performance one.

> "The fastest network request is the one you never make."
> — every performance engineer, eventually

## What changed

We moved parsing, formatting and even SQLite into WebAssembly.[^wasm] The results were "surprising":

- median time-to-result dropped from 380ms to 9ms...
- the server bill dropped to (almost) nothing
- people started using it on planes

## What didn't

Some things *need* the network -- calling an API you typed in, for example. Those tools say so up front.

---

Questions? Write to hello@example.com or visit https://example.com/faq.

[^1]: Except the API workbench, which calls the URL you give it.
[^wasm]: SQLite, DuckDB, jq and Graphviz are all compiled to WebAssembly.
    They are cached by a service worker after the first load.
`;

const MD_HTML = `## Raw HTML

<details>
<summary>Click to expand</summary>

Hidden *markdown* content with a <kbd>Ctrl</kbd>+<kbd>K</kbd> shortcut.

</details>

<p align="center"><img src="https://img.shields.io/badge/html-allowed-blue" alt="badge"></p>

<script>alert("this is removed by the sanitiser")</script>
<a href="javascript:alert(1)" onclick="steal()">a sneaky link</a>
`;

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "css-formatter": {
    inputs: [{ id: "css", label: "CSS / SCSS / Less", lang: "css", placeholder: "Paste a stylesheet — CSS, SCSS or Less" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["format", "Format"], ["minify", "Minify"]], default: "format" },
      { id: "parser", label: "Syntax", type: "segment", choices: [["css", "CSS"], ["scss", "SCSS"], ["less", "Less"]], default: "css", show: isFormat },
      { id: "indent", label: "Indent", type: "segment", choices: indentChoices, default: "2", show: isFormat },
      { id: "width", label: "Print width", type: "number", default: 80, min: 20, max: 240, show: isFormat },
      { id: "singleQuote", label: "Single quotes", type: "toggle", default: false, show: isFormat },
      { id: "license", label: "Keep /*! */ comments", type: "toggle", default: true, show: isMinify, hint: "License comments starting with /*! survive minification" },
    ],
    outLang: "css",
    async run({ inputs, opts }) {
      const src = inputs.css;
      if (!src.trim()) throw new ToolError("Paste some CSS to begin.");
      let text: string;
      if (isMinify(opts)) {
        const { minifyCss } = await import("./lib/C-minify");
        text = minifyCss(src, { keepLicense: bool(opts.license) });
      } else {
        text = (await prettierFormat(src, str(opts.parser, "css"), { tabWidth: opts.indent === "4" ? 4 : 2, useTabs: opts.indent === "tab", printWidth: num(opts.width, 80), singleQuote: bool(opts.singleQuote) })).trimEnd();
      }
      const rules = (text.match(/\{/g) ?? []).length;
      const decls = (text.match(/[^{};]+:[^{};]+(;|(?=}))/g) ?? []).length;
      return {
        text,
        filename: isMinify(opts) ? "styles.min.css" : `styles.${str(opts.parser, "css")}`,
        views: [
          { label: isMinify(opts) ? "Minified" : "Formatted", out: { kind: "text", text, lang: "css", wrap: isMinify(opts) } },
          await sizeStats(src, text, [{ label: "Blocks", value: rules }, { label: "Declarations", value: decls }]),
        ],
      };
    },
    examples: [
      { label: "Minified CSS", inputs: { css: CSS_MIN }, note: "Custom properties, a media query and a transition list expanded by Prettier." },
      { label: "SCSS nesting", inputs: { css: SCSS }, opts: { parser: "scss" }, note: "Variables, mixins, & selectors and nested @media — parsed as SCSS." },
      { label: "Less", inputs: { css: LESS }, opts: { parser: "less", indent: "4" }, note: "Less mixins, guards and :extend with four-space indent." },
      { label: "Messy → tidy", inputs: { css: CSS_MESSY }, opts: { singleQuote: true, width: 60 }, note: "Irregular spacing, blank lines and double semicolons normalised." },
      { label: "Minify", inputs: { css: CSS_MESSY }, opts: { mode: "minify" }, note: "Comments stripped (except /*! */), 0px → 0, 1.50rem → 1.5rem, #AABBCC → #abc, empty rules removed." },
      { label: "Syntax error", inputs: { css: ".card { color: red;\n  .title { font-weight: 600 \n}" }, error: true, note: "An unclosed block — the error shows the line and a code frame." },
    ],
  },

  "html-formatter": {
    inputs: [{ id: "html", label: "HTML", lang: "html", placeholder: "Paste an HTML document or fragment" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["format", "Format"], ["minify", "Minify"]], default: "format" },
      { id: "width", label: "Print width", type: "number", default: 100, min: 20, max: 240, show: isFormat },
      { id: "tab", label: "Tab width", type: "segment", choices: indentChoices, default: "2", show: isFormat },
      { id: "ws", label: "Whitespace", type: "segment", choices: [["css", "CSS"], ["strict", "Strict"], ["ignore", "Ignore"]], default: "css", show: isFormat, hint: "How significant whitespace around inline elements is treated" },
      { id: "attrLine", label: "One attribute per line", type: "toggle", default: false, show: isFormat },
      { id: "comments", label: "Keep comments", type: "toggle", default: false, show: isMinify },
    ],
    outLang: "html",
    async run({ inputs, opts, pipeline }) {
      const src = inputs.html;
      if (!src.trim()) throw new ToolError("Paste some HTML to begin.");
      let text: string;
      if (isMinify(opts)) {
        const { minifyHtml } = await import("./lib/C-minify");
        text = minifyHtml(src, { comments: bool(opts.comments) });
      } else {
        text = (
          await prettierFormat(src, "html", {
            printWidth: num(opts.width, 100),
            tabWidth: opts.tab === "4" ? 4 : 2,
            useTabs: opts.tab === "tab",
            htmlWhitespaceSensitivity: str(opts.ws, "css"),
            singleAttributePerLine: bool(opts.attrLine),
          })
        ).trimEnd();
      }
      if (pipeline) return { text, lang: "html" };
      const tags = (src.match(/<[a-zA-Z][\w-]*/g) ?? []).length;
      return {
        text,
        filename: isMinify(opts) ? "index.min.html" : "index.html",
        views: [
          { label: isMinify(opts) ? "Minified" : "Formatted", out: { kind: "text", text, lang: "html", wrap: isMinify(opts) } },
          { label: "Preview", out: { kind: "frame", srcdoc: /<html|<body|<head/i.test(text) ? text : `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui,sans-serif;padding:12px">${text}</body>` } },
          await sizeStats(src, text, [{ label: "Elements", value: tags }]),
        ],
      };
    },
    examples: [
      { label: "Pricing page", inputs: { html: HTML_PAGE }, note: "A one-line page expanded; inline <style> is formatted as CSS too. See the Preview tab." },
      { label: "Form, attr per line", inputs: { html: HTML_FORM }, opts: { attrLine: true, width: 80, ws: "ignore" }, note: "Every attribute on its own line — handy for code review diffs." },
      { label: "Table", inputs: { html: HTML_TABLE }, opts: { tab: "4" } },
      { label: "Whitespace: ignore", inputs: { html: HTML_PRE }, opts: { ws: "ignore" }, note: "Ignore lets Prettier reflow inline text freely; <pre> and <textarea> are still untouched." },
      { label: "Minify", inputs: { html: HTML_PRE }, opts: { mode: "minify" }, note: "Whitespace collapses and comments drop — but <pre> and <textarea> content is kept byte-for-byte." },
      { label: "Minify a page", inputs: { html: HTML_PAGE }, opts: { mode: "minify", comments: true } },
      { label: "Unclosed tag", inputs: { html: "<div>\n  <p>Hello\n  </span>\n</div>" }, error: true, note: "Prettier reports the unexpected closing tag with its position." },
    ],
  },

  "js-formatter": {
    inputs: [{ id: "code", label: "JavaScript / TypeScript", lang: "js", placeholder: "Paste JS, JSX, TypeScript or Flow" }],
    options: [
      { id: "parser", label: "Parser", type: "select", choices: [["babel", "JavaScript (Babel)"], ["typescript", "TypeScript"], ["babel-ts", "TypeScript (Babel)"], ["flow", "Flow"]], default: "babel" },
      { id: "width", label: "Print width", type: "number", default: 80, min: 20, max: 240 },
      { id: "tab", label: "Tab width", type: "segment", choices: indentChoices, default: "2" },
      { id: "semi", label: "Semicolons", type: "toggle", default: true },
      { id: "singleQuote", label: "Single quotes", type: "toggle", default: false },
      { id: "jsxSingleQuote", label: "JSX single quotes", type: "toggle", default: false },
      { id: "trailing", label: "Trailing commas", type: "segment", choices: [["all", "All"], ["es5", "ES5"], ["none", "None"]], default: "all" },
      { id: "arrow", label: "Arrow parens", type: "segment", choices: [["always", "Always"], ["avoid", "Avoid"]], default: "always" },
      { id: "bracket", label: "Bracket spacing", type: "toggle", default: true },
    ],
    outLang: "js",
    async run({ inputs, opts }) {
      const src = inputs.code;
      if (!src.trim()) throw new ToolError("Paste some code to format.");
      const parser = str(opts.parser, "babel");
      const text = (
        await prettierFormat(src, parser, {
          printWidth: num(opts.width, 80),
          tabWidth: opts.tab === "4" ? 4 : 2,
          useTabs: opts.tab === "tab",
          semi: bool(opts.semi),
          singleQuote: bool(opts.singleQuote),
          jsxSingleQuote: bool(opts.jsxSingleQuote),
          trailingComma: str(opts.trailing, "all"),
          arrowParens: str(opts.arrow, "always"),
          bracketSpacing: bool(opts.bracket),
        })
      ).trimEnd();
      const lang = parser === "typescript" || parser === "babel-ts" ? "ts" : "js";
      return { text, lang, filename: lang === "ts" ? "formatted.ts" : "formatted.js", views: [{ label: "Formatted", out: { kind: "text", text, lang } }, await sizeStats(src, text)] };
    },
    examples: [
      { label: "Minified module", inputs: { code: JS_MIN }, note: "A React hook and an API client unminified; template literals and spreads intact." },
      { label: "TypeScript", inputs: { code: TS_SRC }, opts: { parser: "typescript", singleQuote: true }, note: "Generics, interfaces, parameter properties and enums." },
      { label: "React JSX", inputs: { code: JSX_SRC }, opts: { semi: false, singleQuote: true, jsxSingleQuote: true, arrow: "avoid" }, note: "Semicolon-free style with single quotes in JS and JSX." },
      { label: "Flow", inputs: { code: FLOW_SRC }, opts: { parser: "flow", trailing: "es5" }, note: "Exact object types {| |}, $ReadOnlyArray and maybe types ?Point." },
      { label: "Narrow & tabs", inputs: { code: JS_MIN }, opts: { width: 50, tab: "tab", bracket: false, trailing: "none" } },
      { label: "Syntax error", inputs: { code: "const user = {\n  name: 'Ada',\n  roles: ['admin' 'editor'],\n};" }, error: true, note: "Errors carry line and column plus a code frame pointing at the problem." },
    ],
  },

  "sql-formatter": {
    inputs: [{ id: "sql", label: "SQL", lang: "sql", placeholder: "Paste one or more SQL statements" }],
    options: [
      { id: "mode", label: "Mode", type: "segment", choices: [["format", "Format"], ["minify", "Minify"]], default: "format" },
      { id: "language", label: "Dialect", type: "select", choices: SQL_LANGS, default: "sql", show: isFormat },
      { id: "keywordCase", label: "Keywords", type: "segment", choices: CASE3, default: "upper", show: isFormat },
      { id: "identifierCase", label: "Identifiers", type: "segment", choices: CASE3, default: "preserve", show: isFormat },
      { id: "dataTypeCase", label: "Data types", type: "segment", choices: CASE3, default: "upper", show: isFormat },
      { id: "functionCase", label: "Functions", type: "segment", choices: CASE3, default: "preserve", show: isFormat },
      { id: "indent", label: "Tab width", type: "segment", choices: [["2", "2"], ["4", "4"], ["tab", "Tab"]], default: "2", show: isFormat },
      { id: "indentStyle", label: "Indent style", type: "select", choices: [["standard", "Standard"], ["tabularLeft", "Tabular, left"], ["tabularRight", "Tabular, right"]], default: "standard", show: isFormat },
      { id: "logical", label: "AND/OR newline", type: "segment", choices: [["before", "Before"], ["after", "After"]], default: "before", show: isFormat },
      { id: "between", label: "Lines between queries", type: "number", default: 1, min: 0, max: 5, show: isFormat },
      { id: "exprWidth", label: "Expression width", type: "number", default: 50, min: 10, max: 200, show: isFormat, hint: "Parenthesised expressions shorter than this stay on one line" },
      { id: "dense", label: "Dense operators", type: "toggle", default: false, show: isFormat },
      { id: "comments", label: "Keep comments", type: "toggle", default: false, show: isMinify },
    ],
    outLang: "sql",
    async run({ inputs, opts }) {
      const src = inputs.sql;
      if (!src.trim()) throw new ToolError("Paste some SQL to begin.");
      let text: string;
      if (isMinify(opts)) {
        const { minifySql } = await import("./lib/C-minify");
        text = minifySql(src, { comments: bool(opts.comments) });
      } else {
        const { format } = await import("sql-formatter");
        try {
          text = format(src, {
            language: str(opts.language, "sql") as "sql",
            keywordCase: str(opts.keywordCase) as "upper",
            identifierCase: str(opts.identifierCase) as "preserve",
            dataTypeCase: str(opts.dataTypeCase) as "upper",
            functionCase: str(opts.functionCase) as "preserve",
            tabWidth: opts.indent === "4" ? 4 : 2,
            useTabs: opts.indent === "tab",
            indentStyle: str(opts.indentStyle, "standard") as "standard",
            logicalOperatorNewline: str(opts.logical, "before") as "before",
            linesBetweenQueries: num(opts.between, 1),
            expressionWidth: num(opts.exprWidth, 50),
            denseOperators: bool(opts.dense),
          });
        } catch (e) {
          const msg = (e as Error).message;
          const m = /line (\d+) column (\d+)/i.exec(msg);
          if (m) {
            const { codeFrame } = await util();
            throw new ToolError(`${msg.split("\n")[0]}\n\n${codeFrame(src, +m[1], +m[2])}\n\nTip: pick the matching dialect — e.g. MySQL backticks, T-SQL [brackets], BigQuery \`project.table\`.`);
          }
          throw new ToolError(msg);
        }
      }
      const statements = src.split(/;\s*(?:\n|$)/).filter((s) => s.replace(/--.*$/gm, "").trim()).length;
      return {
        text,
        filename: "query.sql",
        views: [
          { label: isMinify(opts) ? "Minified" : "Formatted", out: { kind: "text", text, lang: "sql", wrap: isMinify(opts) } },
          await sizeStats(src, text, [{ label: "Statements", value: statements }]),
        ],
      };
    },
    examples: [
      { label: "Analytics CTE", inputs: { sql: SQL_REPORT }, opts: { language: "postgresql" }, note: "A CTE with joins, window functions and an interval — PostgreSQL dialect." },
      { label: "MySQL upsert", inputs: { sql: SQL_MYSQL }, opts: { language: "mysql", keywordCase: "lower", between: 2 }, note: "Three statements with backtick identifiers, lower-case keywords, two blank lines between." },
      { label: "T-SQL", inputs: { sql: SQL_TSQL }, opts: { language: "transactsql", indentStyle: "tabularLeft" }, note: "[Bracketed] identifiers and TOP — tabular indent aligns keywords in a column." },
      { label: "Postgres JSONB", inputs: { sql: SQL_PG }, opts: { language: "postgresql", functionCase: "upper", logical: "after" }, note: "Operators ->>, @> and ::casts, $1 parameters, AND at line ends." },
      { label: "BigQuery", inputs: { sql: SQL_BQ }, opts: { language: "bigquery", indent: "4", dense: true } },
      { label: "Minify", inputs: { sql: SQL_COMMENTED }, opts: { mode: "minify" }, note: "Comments and whitespace removed — string literals like 'O''Brien -- test' are left alone." },
      { label: "Wrong dialect", inputs: { sql: "SELECT [id], [name] FROM [dbo].[Users] WHERE [id] = @id" }, opts: { language: "postgresql" }, error: true, note: "T-SQL brackets aren't valid PostgreSQL — switch the dialect to SQL Server to fix it." },
    ],
  },

  "inline-sql-vars": {
    inputs: [
      { id: "sql", label: "SQL with placeholders", lang: "sql", placeholder: "SELECT * FROM users WHERE id = ? AND status = ?" },
      { id: "values", label: "Values — JSON, CSV, name=value lines, or an ORM log", lang: "text", rows: 7, placeholder: '[42, "active"]  ·  {"id": 42}  ·  42, active  ·  ==> Parameters: 42(Long), active(String)' },
    ],
    options: [
      { id: "style", label: "Placeholders", type: "select", choices: [["auto", "Auto-detect"], ["?", "? (JDBC)"], ["$1", "$1 (PostgreSQL)"], [":name", ":name"], ["@name", "@name (T-SQL)"], ["%s", "%s (Python)"], ["%(name)s", "%(name)s (pyformat)"], ["{name}", "{name} / {0}"]], default: "auto" },
      { id: "dialect", label: "Quote for", type: "select", choices: [["generic", "Generic SQL"], ["postgresql", "PostgreSQL"], ["mysql", "MySQL / MariaDB"], ["sqlite", "SQLite"], ["transactsql", "SQL Server"], ["plsql", "Oracle"]], default: "generic" },
      { id: "annotate", label: "Annotate /* placeholder */", type: "toggle", default: false },
      { id: "format", label: "Format SQL", type: "toggle", default: true },
    ],
    outLang: "sql",
    async run({ inputs, opts }) {
      const L = await import("./lib/C-sqlvars");
      const vals = L.parseValues(inputs.values);
      let sql = inputs.sql.trim();
      // A pasted log in the SQL box: pull out the statement.
      const prep = /Preparing:\s*(.+)/.exec(sql);
      if (prep) {
        if (!inputs.values.trim()) Object.assign(vals, L.parseValues(sql));
        sql = prep[1].trim();
      }
      if (!sql && vals.sql) sql = vals.sql;
      if (!sql) throw new ToolError("Paste a SQL statement with placeholders (or a MyBatis / Hibernate log that contains one).");
      const found = L.findPlaceholders(sql);
      const style = (str(opts.style) === "auto" ? L.detectStyle(found) : str(opts.style)) as import("./lib/C-sqlvars").Style | null;
      const dialect = str(opts.dialect, "generic") as import("./lib/C-sqlvars").Dialect;
      const issues: { level: "error" | "warning" | "info" | "ok"; message: string; line?: number; col?: number }[] = [];
      const rows: (string | number | null)[][] = [];
      let out = sql;
      const usedPos = new Set<number>();
      const usedNamed = new Set<string>();
      const { lineColAt } = await util();
      if (style) {
        const phs = found[style];
        const edits: { s: number; e: number; t: string }[] = [];
        for (const ph of phs) {
          let v: import("./lib/C-sqlvars").Val | undefined;
          if (typeof ph.key === "number") {
            const idx = style === "$1" || (style === "{name}" && false) ? ph.key - 1 : ph.key;
            v = vals.positional[idx];
            if (v) usedPos.add(idx);
          } else {
            v = vals.named.get(ph.key) ?? vals.named.get(ph.key.toLowerCase());
            if (v) usedNamed.add(vals.named.has(ph.key) ? ph.key : ph.key.toLowerCase());
            else if (!vals.named.size && vals.positional.length) {
              // named placeholders filled in order from a list
              const order = [...new Set(phs.map((p) => String(p.key)))];
              const idx = order.indexOf(ph.key);
              v = vals.positional[idx];
              if (v) usedPos.add(idx);
            }
          }
          const { line, col } = lineColAt(sql, ph.start);
          if (!v) {
            issues.push({ level: "error", message: `No value for placeholder ${ph.text}${typeof ph.key === "number" && style === "?" ? ` (#${ph.key + 1})` : ""} — left as-is`, line, col });
            rows.push([ph.text, null, "missing", null]);
            continue;
          }
          const before = sql.slice(0, ph.start), after = sql.slice(ph.end);
          const lit = L.literal(v, dialect, /\bIN\s*\(\s*$/i.test(before) && /^\s*\)/.test(after));
          if (v.type === "null" && /(?:[^<>!]=|<>|!=)\s*$/.test(before)) issues.push({ level: "warning", message: `${ph.text} is NULL — “= NULL” is never true in SQL; you probably want IS NULL`, line, col });
          edits.push({ s: ph.start, e: ph.end, t: bool(opts.annotate) ? `${lit} /* ${ph.text} */` : lit });
          rows.push([ph.text + (style === "?" || style === "%s" ? ` #${(ph.key as number) + 1}` : ""), JSON.stringify(v.v) ?? "null", v.label ? `${v.type} (${v.label})` : v.type, lit]);
        }
        edits.sort((a, b) => b.s - a.s);
        for (const x of edits) out = out.slice(0, x.s) + x.t + out.slice(x.e);
        vals.positional.forEach((v, k) => {
          if (!usedPos.has(k) && !(vals.named.size && [...vals.named.values()].includes(v) && usedNamed.size)) issues.push({ level: "warning", message: `Value #${k + 1} (${JSON.stringify(v.v)}) was not used` });
        });
        for (const k of vals.named.keys()) if (!usedNamed.has(k) && usedNamed.size) issues.push({ level: "warning", message: `Named value "${k}" was not used` });
      } else issues.push({ level: "info", message: "No placeholders found in the SQL." });
      if (bool(opts.format)) {
        try {
          const { format } = await import("sql-formatter");
          const lang = { generic: "sql", postgresql: "postgresql", mysql: "mysql", sqlite: "sqlite", transactsql: "transactsql", plsql: "plsql" }[dialect] as "sql";
          out = format(out, { language: lang, keywordCase: "upper" });
        } catch {
          issues.push({ level: "info", message: "sql-formatter could not parse the result, so it is shown unformatted." });
        }
      }
      const errors = issues.filter((i) => i.level === "error").length;
      if (errors) out = `-- ✗ ${errors} placeholder${errors > 1 ? "s" : ""} without a value (left as-is) — see Issues\n` + out;
      const phCount = style ? found[style].length : 0;
      return {
        text: out,
        lang: "sql",
        notes: [`${phCount} ${style ?? ""} placeholder${phCount === 1 ? "" : "s"} · values from ${vals.source}${errors ? ` · ${errors} unmatched` : ""}`],
        views: [
          { label: "SQL", out: { kind: "text", text: out, lang: "sql" } },
          { label: `Bindings (${rows.length})`, out: { kind: "table", columns: ["placeholder", "value", "type", "literal"], rows } },
          { label: `Issues (${issues.length})`, out: { kind: "issues", items: issues.length ? issues : [{ level: "ok", message: "Every placeholder has a value and every value was used." }] } },
        ],
      };
    },
    examples: [
      { label: "JDBC ? + JSON", inputs: { sql: "SELECT id, email FROM users WHERE status = ? AND created_at > ? AND plan IN (?) AND is_admin = ? LIMIT ?", values: '["active", "2026-09-01T00:00:00Z", ["pro", "team"], false, 50]' }, opts: { dialect: "postgresql" }, note: "Strings quoted, the timestamp typed, the array expanded, the boolean and number raw." },
      { label: "MyBatis log", inputs: { sql: "==>  Preparing: UPDATE orders SET status = ?, note = ?, shipped_at = ? WHERE id = ? AND customer_id = ?", values: "==> Parameters: shipped(String), Customer's gift, wrap it(String), 2026-09-24 10:15:00.0(Timestamp), 1042(Long), null" }, opts: { dialect: "mysql" }, note: "The Preparing: statement and the typed Parameters: line straight from a MyBatis log; O'Brien-style quotes are escaped." },
      { label: "Hibernate log", inputs: { sql: "", values: "Hibernate: select u1_0.id,u1_0.email from users u1_0 where u1_0.email=? and u1_0.active=? and u1_0.tenant_id=?\nbinding parameter [1] as [VARCHAR] - [ada@example.com]\nbinding parameter [2] as [BOOLEAN] - [true]\nbinding parameter [3] as [BIGINT] - [7]" }, note: "Leave SQL empty: both the statement and the bindings come from the Hibernate log." },
      { label: "Rails $1", inputs: { sql: 'SELECT "users".* FROM "users" WHERE "users"."email" = $1 AND "users"."deleted_at" IS NULL LIMIT $2', values: '[["email", "grace@example.com"], ["LIMIT", 1]]' }, opts: { dialect: "postgresql", annotate: true }, note: "A Rails log bind array; Annotate leaves /* $1 */ markers so you can see what went where." },
      { label: ":named + JSON object", inputs: { sql: "SELECT * FROM invoices WHERE customer_id = :customerId AND total >= :min AND issued_on BETWEEN :from AND :to AND notes <> 'n/a :not_a_param'", values: '{"customerId": 42, "min": 99.5, "from": "2026-01-01", "to": "2026-06-30"}' }, opts: { dialect: "plsql" }, note: "Dates become DATE literals; the :not_a_param inside a string is correctly ignored." },
      { label: "pyformat", inputs: { sql: "INSERT INTO events (user_id, kind, payload) VALUES (%(user_id)s, %(kind)s, %(payload)s)", values: 'user_id=7\nkind="login"\npayload={"ip":"10.0.0.1"}' }, opts: { dialect: "postgresql" } },
      { label: "T-SQL @name", inputs: { sql: "SELECT TOP (@n) * FROM Customers WHERE Country = @country AND Name LIKE @pattern", values: "n=5\ncountry=Österreich\npattern='A%'" }, opts: { dialect: "transactsql" }, note: "Non-ASCII strings get the N'…' prefix for SQL Server." },
      { label: "Missing value", inputs: { sql: "DELETE FROM sessions WHERE user_id = ? AND expires_at < ? AND device = ?", values: "42, 2026-09-24" }, error: true, note: "The third placeholder has no value — it is reported and left in place." },
    ],
    steps: ["Paste the SQL with ?, $1, :name, @name, %s, %(name)s or {name} placeholders.", "Paste the values: a JSON array/object, a CSV list, name=value lines, or the raw ORM log lines.", "Pick the dialect for quoting; check the Bindings and Issues tabs."],
  },

  "stack-trace-formatter": {
    inputs: [{ id: "trace", label: "Stack trace", lang: "text", placeholder: "Paste a JavaScript stack trace (Node, Chrome, Firefox, Safari or a React component stack)" }],
    options: [
      { id: "hideModules", label: "Hide node_modules", type: "toggle", default: false },
      { id: "hideInternals", label: "Hide internals", type: "toggle", default: false, hint: "node:internal, native and browser-extension frames" },
      { id: "shorten", label: "Shorten paths", type: "segment", choices: [["none", "No"], ["prefix", "Common prefix"], ["cwd", "Strip cwd"]], default: "prefix" },
      { id: "cwd", label: "cwd", type: "text", default: "", placeholder: "/Users/me/project", width: 200, show: (o) => str(o.shorten) === "cwd" },
      { id: "demangle", label: "Demangle webpack://", type: "toggle", default: true },
    ],
    async run({ inputs, opts }) {
      if (!inputs.trace.trim()) throw new ToolError("Paste a stack trace to begin.");
      const T = await import("./lib/C-traces");
      const errors = T.parseJsTrace(inputs.trace, { demangle: bool(opts.demangle) });
      const all = errors.flatMap((e) => e.frames);
      if (!all.length) throw new ToolError("No stack frames found. Expected lines like “at fn (file.js:10:5)”, “fn@file.js:10:5” or “in Component (at File.js:10)”.");
      const fo = { hideModules: bool(opts.hideModules), hideInternals: bool(opts.hideInternals), shorten: str(opts.shorten) as "prefix", cwd: str(opts.cwd) };
      const short = T.shortenPaths(errors, fo);
      const hidden = (f: import("./lib/C-traces").JsFrame) => (fo.hideModules && f.kind === "node_modules") || (fo.hideInternals && (f.kind === "node internal" || f.kind === "native" || f.kind === "browser extension"));
      const loc = (f: import("./lib/C-traces").JsFrame) => (f.file ? `${short(f.file)}${f.line != null ? `:${f.line}` : ""}${f.col != null ? `:${f.col}` : ""}` : f.kind === "native" ? "<native>" : "");
      const lines: string[] = [];
      errors.forEach((e, k) => {
        lines.push(`${k ? (e.label === "Caused by" ? "Caused by: " : "\n") : ""}${e.type}${e.message ? ": " + e.message : ""}`);
        const rows: string[][] = [];
        let skipped: Record<string, number> = {};
        const flush = () => {
          const parts = Object.entries(skipped).map(([kind, n]) => `${n} ${kind}`);
          if (parts.length) rows.push([`    … ${parts.join(", ")} frame${Object.values(skipped).reduce((a, b) => a + b, 0) > 1 ? "s" : ""} hidden`]);
          skipped = {};
        };
        for (const f of e.frames) {
          if (hidden(f)) { skipped[f.kind] = (skipped[f.kind] ?? 0) + 1; continue; }
          flush();
          const fn = (f.async ? "async " : "") + (f.fn || "<anonymous>");
          rows.push([`    at ${fn}`, loc(f)]);
        }
        flush();
        const w = Math.min(48, Math.max(0, ...rows.filter((r) => r.length > 1).map((r) => r[0].length)));
        for (const r of rows) lines.push(r.length > 1 && r[1] ? `${r[0].padEnd(w)}  ${r[1]}` : r[0]);
      });
      const text = lines.join("\n");
      const top = all.find((f) => f.kind === "app" && f.file);
      const count = (k: string) => all.filter((f) => f.kind === k).length;
      return {
        text,
        views: [
          { label: "Cleaned", out: { kind: "text", text } },
          {
            label: `Frames (${all.length})`,
            out: { kind: "table", columns: ["error", "function", "file", "line", "col", "kind"], rows: all.map((f) => [f.err + 1, (f.async ? "async " : "") + (f.fn || "<anonymous>"), f.file ? short(f.file) : "", f.line, f.col, f.kind]) },
          },
          {
            label: "Summary",
            out: {
              kind: "stats",
              items: [
                { label: "Error type", value: errors[0].type, tone: "bad" },
                { label: "Message", value: errors[0].message.split("\n")[0] || "—" },
                { label: "Top app frame", value: top ? `${top.fn || "<anonymous>"} · ${short(top.file)}:${top.line}` : "—", tone: "info" },
                ...(errors.length > 1 ? [{ label: "Root cause", value: `${errors[errors.length - 1].type}: ${errors[errors.length - 1].message.split("\n")[0]}`, tone: "warn" as const }] : []),
                { label: "App frames", value: count("app"), tone: "ok" },
                { label: "node_modules", value: count("node_modules") },
                { label: "Internals / native", value: count("node internal") + count("native") },
                { label: "Extensions", value: count("browser extension") },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Node + Express", inputs: { trace: NODE_TRACE }, opts: { hideModules: true }, note: "Express router frames collapse into one line; the async boundary stays visible." },
      { label: "Chrome + webpack", inputs: { trace: CHROME_TRACE }, opts: { hideInternals: true }, note: "webpack-internal:/// and ?hash suffixes are demangled; the DevTools extension frame is classified and hidden." },
      { label: "Firefox", inputs: { trace: FIREFOX_TRACE }, note: "fn@file:line:col frames, async* markers and anonymous “/<” names." },
      { label: "Safari", inputs: { trace: SAFARI_TRACE }, opts: { shorten: "none" }, note: "Safari's [native code] and “global code” frames." },
      { label: "React component stack", inputs: { trace: REACT_STACK }, note: "A React warning's component stack: in Component (at File.js:line)." },
      { label: "Error with cause", inputs: { trace: CAUSE_TRACE }, opts: { shorten: "cwd", cwd: "file:///srv/app/dist" }, note: "Node's { [cause]: … } becomes a Caused by section; paths are relative to the cwd you type." },
    ],
  },

  "java-exception-formatter": {
    inputs: [{ id: "trace", label: "Java / JVM exception", lang: "java", placeholder: "Paste an exception — multi-line, or flattened onto one log line" }],
    options: [
      { id: "collapse", label: "Collapse framework frames", type: "toggle", default: true },
      { id: "packages", label: "Framework packages", type: "text", default: "java., javax., jdk., sun., com.sun., org.springframework., org.apache., org.hibernate., kotlin., kotlinx., reactor., io.netty., org.junit., jakarta.", width: 320, show: (o) => bool(o.collapse) },
      { id: "root", label: "Highlight root cause", type: "toggle", default: true },
      { id: "suppressed", label: "Show suppressed", type: "toggle", default: true },
    ],
    async run({ inputs, opts }) {
      if (!inputs.trace.trim()) throw new ToolError("Paste a Java stack trace to begin.");
      const T = await import("./lib/C-traces");
      const list = T.parseJavaTrace(inputs.trace);
      const frames = list.flatMap((t) => t.frames);
      if (!list.length || !frames.length) throw new ToolError("No stack frames found. Expected lines like “at com.example.Foo.bar(Foo.java:42)”.");
      const pkgs = str(opts.packages).split(/[,\s]+/).filter(Boolean);
      const isFw = (f: import("./lib/C-traces").JavaFrame) => pkgs.some((p) => f.cls.startsWith(p) || f.module.startsWith(p.replace(/\.$/, "")));
      const rootIdx = T.javaRootCause(list);
      const out: string[] = [...(list.preamble ?? [])];
      const chained = list.filter((t) => t.kind !== "suppressed").length > 1;
      const tableRows: (string | number | null)[][] = [];
      list.forEach((t, k) => {
        if (t.kind === "suppressed" && !bool(opts.suppressed)) return;
        const ind = "\t".repeat(t.depth);
        const prefix = t.kind === "cause" ? "Caused by: " : t.kind === "suppressed" ? "Suppressed: " : t.thread ? `Exception in thread "${t.thread}" ` : "";
        const mark = bool(opts.root) && k === rootIdx && chained ? "  ◀── ROOT CAUSE" : "";
        out.push(`${ind}${prefix}${t.cls}${t.message ? ": " + t.message.split("\n").join("\n" + ind + "  ") : ""}${mark}`);
        let run: string[] = [];
        const flushRun = () => {
          if (!run.length) return;
          if (run.length === 1) out.push(`${ind}\tat ${run[0]}`);
          else {
            const groups = new Map<string, number>();
            for (const r of run) {
              const p = pkgs.find((x) => r.startsWith(x) || r.includes("/" + x)) ?? "other";
              groups.set(p.replace(/\.$/, ""), (groups.get(p.replace(/\.$/, "")) ?? 0) + 1);
            }
            out.push(`${ind}\t… ${run.length} framework frames (${[...groups].map(([p, n]) => `${p} ×${n}`).join(", ")})`);
          }
          run = [];
        };
        t.frames.forEach((f) => {
          if ("more" in f) { flushRun(); out.push(`${ind}\t... ${f.more} more`); return; }
          const sig = `${f.module ? f.module + "/" : ""}${f.cls}.${f.method}(${f.native ? "Native Method" : f.file + (f.line != null ? ":" + f.line : "")})`;
          tableRows.push([k + 1, t.cls.split(".").pop()!, f.cls, f.method, f.file, f.line, isFw(f) ? "framework" : "app"]);
          if (bool(opts.collapse) && isFw(f)) { run.push(sig); return; }
          flushRun();
          out.push(`${ind}\tat ${sig}`);
        });
        flushRun();
      });
      const firstApp = (t: import("./lib/C-traces").JavaThrowable) => {
        const f = t.frames.find((x) => !("more" in x) && !isFw(x)) as import("./lib/C-traces").JavaFrame | undefined;
        return f ? `${f.cls.split(".").pop()}.${f.method}(${f.file}:${f.line ?? "?"})` : "—";
      };
      const chainRows = list.map((t, k) => [k + 1, t.kind + (t.depth ? ` (depth ${t.depth})` : ""), t.cls, t.message.split("\n")[0], t.frames.filter((f) => !("more" in f)).length, firstApp(t), k === rootIdx && chained ? "◀ root cause" : ""]);
      const chainText = list.filter((t) => t.kind !== "suppressed").map((t, k) => `${"  ".repeat(k)}${k ? "└─ caused by " : ""}${t.cls}: ${t.message.split("\n")[0]}`).join("\n");
      const root = list[rootIdx];
      return {
        text: out.join("\n"),
        lang: "java",
        views: [
          { label: "Formatted", out: { kind: "text", text: out.join("\n"), lang: "java" } },
          { label: `Frames (${tableRows.length})`, out: { kind: "table", columns: ["#", "exception", "class", "method", "file", "line", "kind"], rows: tableRows } },
          { label: "Causal chain", out: { kind: "table", columns: ["#", "kind", "exception", "message", "frames", "first app frame", ""], rows: chainRows } },
          { label: "Chain (text)", out: { kind: "text", text: chainText } },
          {
            label: "Summary",
            out: {
              kind: "stats",
              items: [
                { label: "Thrown", value: list[0].cls.split(".").pop()!, tone: "warn" },
                { label: "Root cause", value: root.cls.split(".").pop()!, tone: "bad" },
                { label: "Root message", value: root.message.split("\n")[0] || "—" },
                { label: "Where", value: firstApp(root), tone: "info" },
                { label: "Chain length", value: list.filter((t) => t.kind !== "suppressed").length },
                { label: "Suppressed", value: list.filter((t) => t.kind === "suppressed").length },
                { label: "Frames", value: tableRows.length },
                { label: "Framework frames", value: tableRows.filter((r) => r[6] === "framework").length },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Spring Boot startup", inputs: { trace: JAVA_SPRING }, note: "A three-level Caused by chain: framework frames collapse, the ConnectException is marked as the root cause." },
      { label: "NullPointerException", inputs: { trace: JAVA_NPE }, note: "Helpful NPE message; the stream plumbing between app frames folds into one line." },
      { label: "Flattened log (\\n\\t)", inputs: { trace: JAVA_FLAT }, note: "A log line with literal \\n\\tat escapes is unflattened first." },
      { label: "One-line log", inputs: { trace: JAVA_ONELINE }, note: "Everything on one line with spaces before “at” and “Caused by:” — split back into frames." },
      { label: "Suppressed", inputs: { trace: JAVA_SUPPRESSED }, opts: { packages: "java., sun., kotlinx." }, note: "try-with-resources Suppressed: exceptions nest under their parent; the package list is editable." },
      { label: "Everything expanded", inputs: { trace: JAVA_SPRING }, opts: { collapse: false, root: false } },
    ],
  },

  "go-stacktrace-formatter": {
    inputs: [{ id: "trace", label: "Go panic / goroutine dump", lang: "go", placeholder: "Paste panic output or a goroutine dump (SIGQUIT, debug.Stack, pprof ?debug=2)" }],
    options: [
      { id: "group", label: "Group identical goroutines", type: "toggle", default: true },
      { id: "hideRuntime", label: "Hide runtime.*", type: "toggle", default: false },
      { id: "hideStd", label: "Hide stdlib", type: "toggle", default: false },
      { id: "args", label: "Show args", type: "toggle", default: false },
      { id: "offset", label: "Show +0x offsets", type: "toggle", default: false },
    ],
    async run({ inputs, opts }) {
      if (!inputs.trace.trim()) throw new ToolError("Paste Go panic output or a goroutine dump.");
      const T = await import("./lib/C-traces");
      const d = T.parseGoDump(inputs.trace);
      if (!d.goroutines.length) throw new ToolError("No goroutines found. Expected a header like “goroutine 1 [running]:”.");
      const showFrame = (f: import("./lib/C-traces").GoFrame) => !(bool(opts.hideRuntime) && f.runtime) && !(bool(opts.hideStd) && f.std && !f.runtime ? true : bool(opts.hideStd) && f.runtime);
      const fmtFn = (f: import("./lib/C-traces").GoFrame) => `${f.fn}(${bool(opts.args) ? f.args : f.args ? "…" : ""})`;
      const fmtLoc = (f: import("./lib/C-traces").GoFrame) => (f.file ? `${f.file}:${f.line}${bool(opts.offset) && f.offset ? " " + f.offset : ""}` : "(inlined)");
      type Group = { gs: import("./lib/C-traces").Goroutine[]; sig: string };
      const groups: Group[] = [];
      const bySig = new Map<string, Group>();
      for (const g of d.goroutines) {
        const sig = bool(opts.group) ? T.goSignature(g) : String(g.id);
        let grp = bySig.get(sig);
        if (!grp) { grp = { gs: [], sig }; bySig.set(sig, grp); groups.push(grp); }
        grp.gs.push(g);
      }
      const out: string[] = [];
      if (d.fatal) out.push(`fatal error: ${d.fatal}`);
      d.panic.forEach((p, k) => out.push(`${k ? "  " : ""}${/^\[signal/.test(p) ? p : `panic: ${p}`}`));
      if (out.length) out.push("");
      for (const grp of groups) {
        const g = grp.gs[0];
        const ids = grp.gs.map((x) => x.id);
        const waits = [...new Set(grp.gs.map((x) => x.wait).filter(Boolean))];
        const head = grp.gs.length > 1 ? `${grp.gs.length} goroutines [${g.state}${waits.length ? ", " + waits.join(" / ") : ""}${g.locked ? ", locked to thread" : ""}]: ${ids.length > 12 ? ids.slice(0, 12).join(", ") + ", …" : ids.join(", ")}` : `goroutine ${g.id} [${g.state}${g.wait ? ", " + g.wait : ""}${g.locked ? ", locked to thread" : ""}]:`;
        out.push(head);
        const rows: string[][] = [];
        let hidden = 0;
        for (const f of g.frames) {
          if (!showFrame(f)) { hidden++; continue; }
          rows.push([`  ${fmtFn(f)}`, fmtLoc(f)]);
        }
        const w = Math.min(70, Math.max(0, ...rows.map((r) => r[0].length)));
        for (const r of rows) out.push(`${r[0].padEnd(w)}  ${r[1]}`);
        if (hidden) out.push(`  … ${hidden} runtime/stdlib frame${hidden > 1 ? "s" : ""} hidden`);
        if (g.elided) out.push("  …additional frames elided…");
        if (g.createdBy) out.push(`  created by ${g.createdBy.fn}${g.createdBy.inGoroutine ? ` in goroutine ${g.createdBy.inGoroutine}` : ""}  ${fmtLoc(g.createdBy)}`);
        out.push("");
      }
      const text = out.join("\n").trimEnd();
      const states = new Map<string, number>();
      d.goroutines.forEach((g) => states.set(g.state, (states.get(g.state) ?? 0) + 1));
      const topUser = (g: import("./lib/C-traces").Goroutine) => {
        const f = g.frames.find((x) => !x.std) ?? g.frames[0];
        return f ? `${f.fn} (${f.file.split("/").pop()}:${f.line ?? "?"})` : "";
      };
      const crashed = d.goroutines.find((g) => g.state === "running") ?? d.goroutines[0];
      return {
        text,
        lang: "go",
        views: [
          { label: "Formatted", out: { kind: "text", text, lang: "go" } },
          {
            label: `Goroutines (${groups.length})`,
            out: {
              kind: "table",
              columns: ["count", "ids", "state", "wait", "locked", "top frame (yours)", "created by"],
              rows: groups.map((grp) => {
                const g = grp.gs[0];
                return [grp.gs.length, grp.gs.map((x) => x.id).join(", "), g.state, [...new Set(grp.gs.map((x) => x.wait).filter(Boolean))].join(" / ") || null, g.locked, topUser(g), g.createdBy ? `${g.createdBy.fn}${g.createdBy.inGoroutine ? ` (g${g.createdBy.inGoroutine})` : ""}` : null];
              }),
            },
          },
          {
            label: "Summary",
            out: {
              kind: "stats",
              items: [
                ...(d.panic.length ? [{ label: "Panic", value: d.panic[0].split("\n")[0], tone: "bad" as const }] : []),
                ...(d.fatal ? [{ label: "Fatal error", value: d.fatal, tone: "bad" as const }] : []),
                { label: "Crashed in", value: crashed ? topUser(crashed) : "—", tone: "info" },
                { label: "Goroutines", value: d.goroutines.length },
                { label: "Unique stacks", value: bySig.size === d.goroutines.length && !bool(opts.group) ? new Set(d.goroutines.map(T.goSignature)).size : groups.length },
                ...[...states].sort((a, b) => b[1] - a[1]).map(([s, n]) => ({ label: `[${s}]`, value: n, tone: (s === "running" ? "warn" : undefined) as "warn" | undefined })),
                { label: "Longest wait", value: Math.max(0, ...d.goroutines.map((g) => g.minutes)) ? `${Math.max(...d.goroutines.map((g) => g.minutes))} min` : "—" },
              ],
            },
          },
          { label: "Frames", out: { kind: "table", columns: ["goroutine", "function", "file", "line", "offset", "std"], rows: d.goroutines.flatMap((g) => g.frames.map((f) => [g.id, f.fn, f.file, f.line, f.offset, f.std])) } },
        ],
      };
    },
    examples: [
      { label: "Nil map write", inputs: { trace: GO_NILMAP }, note: "The classic: assignment to entry in nil map, with an inlined (...) frame." },
      { label: "Index out of range", inputs: { trace: GO_INDEX }, opts: { hideStd: true }, note: "An HTTP handler panic; hiding the stdlib leaves just your two frames and who created the goroutine." },
      { label: "Deadlock", inputs: { trace: GO_DEADLOCK }, note: "“all goroutines are asleep” — every goroutine's wait reason in the Summary tab." },
      { label: "Many goroutines", inputs: { trace: manyGoroutines() }, note: "17 goroutines grouped into 5 unique stacks, like panicparse — 12 identical workers become one entry." },
      { label: "Custom error [recovered]", inputs: { trace: GO_CUSTOM }, opts: { args: true, offset: true }, note: "A re-panicked error from a deferred recover; args and +0x offsets shown." },
      { label: "Nil pointer (SIGSEGV)", inputs: { trace: GO_NILPTR }, opts: { hideRuntime: true, hideStd: true } },
    ],
  },

  "text-toolbox": {
    inputs: [{ id: "text", label: "Text", lang: "text", wrap: true, placeholder: "Paste text, a list of lines, identifiers…" }],
    options: [
      {
        id: "op",
        label: "Operation",
        type: "select",
        choices: [
          ["upper", "Case · UPPER CASE"], ["lower", "Case · lower case"], ["title", "Case · Title Case"], ["sentence", "Case · Sentence case"], ["camel", "Case · camelCase"], ["pascal", "Case · PascalCase"], ["snake", "Case · snake_case"], ["kebab", "Case · kebab-case"], ["constant", "Case · CONSTANT_CASE"], ["dot", "Case · dot.case"], ["swap", "Case · sWAP cASE"], ["alternate", "Case · aLtErNaTiNg"],
          ["sort-az", "Lines · Sort A → Z"], ["sort-za", "Lines · Sort Z → A"], ["sort-natural", "Lines · Sort natural"], ["sort-length", "Lines · Sort by length"], ["shuffle", "Lines · Shuffle"], ["reverse-lines", "Lines · Reverse order"], ["dedupe", "Lines · Remove duplicates"], ["remove-empty", "Lines · Remove empty"], ["trim", "Lines · Trim"], ["number", "Lines · Number"], ["join", "Lines · Join with separator"], ["split", "Lines · Split on delimiter"], ["wrap", "Lines · Wrap at N columns"], ["affix", "Lines · Add prefix / suffix"], ["keep", "Lines · Keep matching"], ["remove", "Lines · Remove matching"], ["column", "Lines · Extract columns"],
          ["reverse", "Text · Reverse"], ["collapse", "Text · Collapse whitespace"], ["punct", "Text · Remove punctuation"], ["diacritics", "Text · Strip diacritics"], ["slugify", "Text · Slugify"], ["replace", "Text · Find & replace"], ["rot13", "Text · ROT13"], ["count", "Text · Count occurrences"],
          ["emails", "Extract · Emails"], ["urls", "Extract · URLs"], ["numbers", "Extract · Numbers"], ["ips", "Extract · IP addresses"],
        ],
        default: "title",
      },
      { id: "pattern", label: "Find", type: "text", default: "", placeholder: "text or regex", width: 170, show: (o) => ["keep", "remove", "replace", "count"].includes(str(o.op)) },
      { id: "replace", label: "Replace with", type: "text", default: "", placeholder: "$1, \\n …", width: 150, show: (o) => str(o.op) === "replace" },
      { id: "regex", label: "Regex", type: "toggle", default: true, show: (o) => ["keep", "remove", "replace", "count"].includes(str(o.op)) },
      { id: "flags", label: "Flags", type: "text", default: "g", width: 60, show: (o) => str(o.op) === "replace" && bool(o.regex), hint: "g (all), m (multiline), s (dotall), u (unicode)" },
      { id: "ci", label: "Ignore case", type: "toggle", default: false, show: (o) => ["sort-az", "sort-za", "sort-natural", "dedupe", "keep", "remove", "replace", "count", "emails"].includes(str(o.op)) },
      { id: "sep", label: "Separator", type: "text", default: ", ", width: 90, show: (o) => ["join", "split", "number", "column"].includes(str(o.op)), hint: "\\n and \\t are understood; for columns, “auto” detects tab, comma or spaces" },
      { id: "n", label: "N", type: "number", default: 72, min: 0, max: 1000, show: (o) => ["wrap", "number"].includes(str(o.op)), hint: "Wrap width, or the first line number" },
      { id: "cols", label: "Columns", type: "text", default: "1", width: 80, placeholder: "1,3 or 2-4", show: (o) => str(o.op) === "column" },
      { id: "prefix", label: "Prefix", type: "text", default: "- ", width: 90, show: (o) => str(o.op) === "affix" },
      { id: "suffix", label: "Suffix", type: "text", default: "", width: 90, show: (o) => str(o.op) === "affix" },
    ],
    async run({ inputs, opts }) {
      const s = inputs.text;
      const T = await import("./lib/C-textops");
      const op = T.OPS.find((o) => o.id === str(opts.op)) ?? T.OPS[0];
      const p = { sep: str(opts.sep), n: num(opts.n, 72), prefix: str(opts.prefix), suffix: str(opts.suffix), pattern: str(opts.pattern), replace: str(opts.replace), flags: str(opts.flags), regex: bool(opts.regex), ci: bool(opts.ci), cols: str(opts.cols, "1") };
      let text: string;
      try {
        text = op.run(s, p);
      } catch (e) {
        throw new ToolError((e as Error).message.replace(/^(Invalid regular expression: )+/, "Invalid regular expression: "));
      }
      const a = T.textStats(s), b = T.textStats(text);
      const views: View[] = [{ label: op.label, out: { kind: "text", text, wrap: true } }];
      if (op.id === "count") views.push({ label: "Counts", out: { kind: "table", columns: [p.pattern ? "match" : "word", "count"], rows: T.countRows(s, p) } });
      if (["replace", "sort-az", "sort-za", "sort-natural", "dedupe", "remove-empty", "trim", "keep", "remove", "collapse"].includes(op.id)) {
        const { lineDiff } = await import("./lib/diff");
        views.push({ label: "Changes", out: { kind: "diff", hunks: lineDiff(s, text, { context: 2 }).hunks, mode: "unified" } });
      }
      views.push({
        label: "Stats",
        out: {
          kind: "stats",
          items: [
            { label: "Characters", value: a.chars },
            { label: "Without spaces", value: a.charsNoSpace },
            { label: "Words", value: a.words, tone: "info" },
            { label: "Lines", value: a.lines },
            { label: "Non-empty lines", value: a.nonEmpty },
            { label: "Unique lines", value: a.unique },
            { label: "Sentences", value: a.sentences },
            { label: "Paragraphs", value: a.paragraphs },
            { label: "Bytes (UTF-8)", value: a.bytes },
            { label: "Longest line", value: a.longest },
            { label: "Avg word length", value: a.avgWord },
            { label: "Reading time", value: a.reading },
            { label: "Result lines", value: b.lines, tone: "ok" },
            { label: "Result characters", value: b.chars, tone: "ok" },
          ],
        },
      });
      return { text, views };
    },
    examples: [
      { label: "Headline → Title Case", inputs: { text: "the lord of the rings: the return of the king\na tale of two cities\nhow to use an iPhone with NASA data" }, opts: { op: "title" }, note: "Small words stay lower-case except at the ends; iPhone and NASA are left alone." },
      { label: "Names → camelCase", inputs: { text: NAMES }, opts: { op: "camel" }, note: "Each line is split into words from spaces, dashes, underscores and existing camel humps." },
      { label: "CONSTANT_CASE", inputs: { text: NAMES }, opts: { op: "constant" } },
      { label: "Natural sort + dedupe", inputs: { text: FILES }, opts: { op: "sort-natural", ci: true }, note: "report-2 sorts before report-10; try “Remove duplicates” with Ignore case next." },
      { label: "Remove duplicates", inputs: { text: FILES }, opts: { op: "dedupe", ci: true }, note: "Image_3.png and image_3.png count as the same line with Ignore case on." },
      { label: "Regex replace (dates)", inputs: { text: "Invoices due 2026-09-30, 2026-10-15 and 2026-11-01." }, opts: { op: "replace", pattern: "(\\d{4})-(\\d{2})-(\\d{2})", replace: "$3/$2/$1", regex: true, flags: "g" }, note: "Capture groups reorder ISO dates to DD/MM/YYYY; see the Changes tab." },
      { label: "Extract emails", inputs: { text: PROSE }, opts: { op: "emails" } },
      { label: "Extract URLs", inputs: { text: PROSE }, opts: { op: "urls" }, note: "Trailing punctuation is not part of the URL." },
      { label: "CSV column", inputs: { text: CSV_ROWS }, opts: { op: "column", sep: ",", cols: "2,3" }, note: "Columns 2 and 3 (name, email) from comma-separated rows." },
      { label: "Word frequency", inputs: { text: PROSE }, opts: { op: "count", pattern: "", ci: true }, note: "With Find empty, Count occurrences ranks every word." },
      { label: "Wrap at 40", inputs: { text: PROSE }, opts: { op: "wrap", n: 40 } },
      { label: "Slugify titles", inputs: { text: "Crème Brûlée & Other Desserts\nWhy we went offline-first (2026)\n  Straße in München  " }, opts: { op: "slugify" } },
      { label: "Join as SQL list", inputs: { text: "'ada'\n'grace'\n'linus'" }, opts: { op: "join", sep: ", " } },
      { label: "Markdown bullets", inputs: { text: "Buy milk\nShip v2.3\nCall the bank" }, opts: { op: "affix", prefix: "- [ ] ", suffix: "" } },
      { label: "ROT13", inputs: { text: "Why did the chicken cross the road? Gb trg gb gur bgure fvqr!" }, opts: { op: "rot13" } },
      { label: "Bad regex", inputs: { text: "abc" }, opts: { op: "keep", pattern: "([a-z]", regex: true }, error: true },
    ],
  },

  "log-privacy-workbench": {
    inputs: [{ id: "log", label: "Log", lang: "text", placeholder: "Paste log lines: JSON lines, logfmt, Apache/Nginx, syslog or “timestamp LEVEL message”" }],
    options: [
      { id: "format", label: "Format", type: "select", choices: [["auto", "Auto-detect"], ["json", "JSON lines"], ["logfmt", "logfmt"], ["combined", "Apache / Nginx"], ["syslog", "Syslog"], ["generic", "Generic text"]], default: "auto" },
      { id: "mask", label: "Mask", type: "segment", choices: [["label", "[REDACTED:type]"], ["stars", "***"], ["pseudo", "Pseudonym"]], default: "label", hint: "Pseudonyms are consistent: the same value always maps to the same token" },
      { id: "lvError", label: "ERROR", type: "toggle", default: true },
      { id: "lvWarn", label: "WARN", type: "toggle", default: true },
      { id: "lvInfo", label: "INFO", type: "toggle", default: true },
      { id: "lvDebug", label: "DEBUG", type: "toggle", default: true },
      { id: "lvOther", label: "Other", type: "toggle", default: true },
      { id: "include", label: "Include /re/", type: "text", default: "", width: 130, placeholder: "regex" },
      { id: "exclude", label: "Exclude /re/", type: "text", default: "", width: 130, placeholder: "health|metrics" },
      { id: "onlyHits", label: "Only lines with redactions", type: "toggle", default: false },
      { id: "rEmail", label: "Emails", type: "toggle", default: true },
      { id: "rIp", label: "IPs", type: "toggle", default: true },
      { id: "rCard", label: "Cards", type: "toggle", default: true },
      { id: "rJwt", label: "JWTs", type: "toggle", default: true },
      { id: "rAuth", label: "Auth headers", type: "toggle", default: true },
      { id: "rKey", label: "API keys", type: "toggle", default: true },
      { id: "rSecret", label: "Secrets k=v", type: "toggle", default: true },
      { id: "rUuid", label: "UUIDs", type: "toggle", default: false },
      { id: "rPhone", label: "Phones", type: "toggle", default: true },
      { id: "rSsn", label: "SSNs", type: "toggle", default: true },
    ],
    async run({ inputs, opts }) {
      if (!inputs.log.trim()) throw new ToolError("Paste some log lines to begin.");
      const L = await import("./lib/C-logs");
      const entries = L.parseLog(inputs.log, str(opts.format, "auto"));
      const rules = new Set<import("./lib/C-logs").RuleId>();
      const map: [string, import("./lib/C-logs").RuleId][] = [["rEmail", "email"], ["rIp", "ip"], ["rCard", "card"], ["rJwt", "jwt"], ["rAuth", "auth"], ["rKey", "apikey"], ["rSecret", "secret"], ["rUuid", "uuid"], ["rPhone", "phone"], ["rSsn", "ssn"]];
      for (const [o, r] of map) if (bool(opts[o])) rules.add(r);
      const { redact, counts, mapping } = L.makeRedactor(rules, str(opts.mask, "label") as "label");
      const levelOn: Record<string, boolean> = { ERROR: bool(opts.lvError), WARN: bool(opts.lvWarn), INFO: bool(opts.lvInfo), DEBUG: bool(opts.lvDebug), OTHER: bool(opts.lvOther) };
      const mkRe = (s: string, what: string) => {
        if (!s.trim()) return null;
        try { return new RegExp(s, "i"); } catch (e) { throw new ToolError(`${what} is not a valid regex: ${(e as Error).message}`); }
      };
      const inc = mkRe(str(opts.include), "Include"), exc = mkRe(str(opts.exclude), "Exclude");
      const kept: { e: import("./lib/C-logs").Entry; text: string; msg: string; hits: number }[] = [];
      const perLevel: Record<string, number> = {};
      const formats: Record<string, number> = {};
      for (const e of entries) {
        perLevel[e.level] = (perLevel[e.level] ?? 0) + 1;
        formats[e.format] = (formats[e.format] ?? 0) + 1;
        if (!levelOn[e.level]) continue;
        if (inc && !inc.test(e.raw)) continue;
        if (exc && exc.test(e.raw)) continue;
        const r = redact(e.raw);
        if (bool(opts.onlyHits) && !r.hits) continue;
        kept.push({ e, text: r.text, msg: r.hits ? redact(e.message).text : e.message, hits: r.hits });
      }
      const text = kept.map((k) => k.text).join("\n");
      const total = [...counts.values()].reduce((a, b) => a + b, 0);
      const fmt = Object.entries(formats).sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ×${n}`).join(", ");
      const views: View[] = [
        { label: "Redacted", out: { kind: "text", text: text || "(no lines match the filters)" } },
        { label: `Parsed (${kept.length})`, out: { kind: "table", columns: ["line", "time", "level", "source", "message", "redactions"], rows: kept.map((k) => [k.e.lineNo, k.e.time, k.e.level, k.e.source, k.msg.split("\n")[0], k.hits]) } },
        {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Entries", value: entries.length },
              { label: "Shown", value: kept.length, tone: "info" },
              { label: "Redactions", value: total, tone: total ? "warn" : "ok" },
              ...(["ERROR", "WARN", "INFO", "DEBUG", "OTHER"] as const).filter((l) => perLevel[l]).map((l) => ({ label: l, value: perLevel[l], tone: (l === "ERROR" ? "bad" : l === "WARN" ? "warn" : undefined) as "bad" | "warn" | undefined })),
              ...[...counts].sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: `⊘ ${L.RULE_LABELS[r]}`, value: n, tone: "warn" as const })),
            ],
          },
        },
      ];
      if (str(opts.mask) === "pseudo" && mapping.size) views.push({ label: "Pseudonyms", out: { kind: "table", columns: ["type", "token", "occurs as"], rows: [...mapping].map(([k, tok]) => [k.split("\0")[0], tok, k.split("\0")[1].length > 12 ? k.split("\0")[1].slice(0, 4) + "…" + k.split("\0")[1].slice(-3) : k.split("\0")[1]]) } });
      return { text, filename: "redacted.log", notes: [`Detected: ${fmt}. ${total} value${total === 1 ? "" : "s"} redacted across ${kept.filter((k) => k.hits).length} line${kept.filter((k) => k.hits).length === 1 ? "" : "s"}.`], views };
    },
    examples: [
      { label: "App log with secrets", inputs: { log: appLog() }, note: "A JWT bearer token, a Luhn-valid card, Stripe & GitHub keys, a DB password in a URL, a phone and an SSN — all masked." },
      { label: "JSON lines (pino)", inputs: { log: jsonLog() }, opts: { mask: "pseudo", rUuid: true }, note: "Pseudonyms: the same email or IP always becomes the same token, so you can still follow a user through the log." },
      { label: "Nginx access log", inputs: { log: NGINX_LOG }, opts: { lvInfo: false }, note: "Status codes map to levels: INFO hidden, leaving the 404 and 500. Client IPs are redacted." },
      { label: "Syslog", inputs: { log: SYSLOG }, opts: { mask: "stars" }, note: "RFC 3164 and RFC 5424 lines; the <PRI> value gives the severity." },
      { label: "logfmt", inputs: { log: LOGFMT }, opts: { onlyHits: true }, note: "Only lines that needed redacting — a session id, a Slack webhook, a card, an IP and an email." },
      { label: "Errors only, no health checks", inputs: { log: appLog() }, opts: { lvInfo: false, lvDebug: false, exclude: "retrying" } },
    ],
    tips: ["Everything runs locally — nothing you paste leaves the browser.", "Pseudonym tokens are a hash of the value, so they are stable across runs and pastes."],
  },

  "file-diff-viewer": {
    inputs: [
      { id: "a", label: "Original (drop a file)", lang: "text" },
      { id: "b", label: "Changed (drop a file)", lang: "text", rows: 12 },
    ],
    options: [
      { id: "view", label: "View", type: "segment", choices: [["split", "Split"], ["unified", "Unified"]], default: "split" },
      { id: "ws", label: "Ignore whitespace", type: "toggle", default: false },
      { id: "case", label: "Ignore case", type: "toggle", default: false },
      { id: "context", label: "Context", type: "segment", choices: [["0", "0"], ["3", "3"], ["10", "10"], ["all", "All"]], default: "3" },
      { id: "inline", label: "Inline", type: "segment", choices: [["word", "Word"], ["char", "Char"], ["none", "None"]], default: "word" },
    ],
    async run({ inputs, opts }) {
      const a = inputs.a.replace(/\r\n/g, "\n"), b = inputs.b.replace(/\r\n/g, "\n");
      if (!a && !b) throw new ToolError("Paste or drop two files to compare.");
      const { lineDiff } = await import("./lib/diff");
      const ctx = str(opts.context) === "all" ? -1 : num(opts.context, 3);
      const d = lineDiff(a, b, { ignoreWhitespace: bool(opts.ws), ignoreCase: bool(opts.case), context: ctx, inline: str(opts.inline, "word") as "word" });
      // Patch text honouring the ignore options.
      const { createTwoFilesPatch } = await import("diff");
      const norm = (s: string) => {
        let x = s;
        if (bool(opts.ws)) x = x.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).join("\n");
        if (bool(opts.case)) x = x.toLowerCase();
        return x;
      };
      const nl = (s: string) => (s.endsWith("\n") ? s : s + "\n");
      const ctxN = ctx < 0 ? Math.max(a.split("\n").length, b.split("\n").length) : ctx;
      const patch = d.same ? "" : bool(opts.ws) || bool(opts.case) ? remapPatch(createTwoFilesPatch("a/original", "b/changed", nl(norm(a)), nl(norm(b)), "", "", { context: ctxN }), a, b) : createTwoFilesPatch("a/original", "b/changed", nl(a), nl(b), "", "", { context: ctxN });
      let changed = 0;
      for (let i = 0; i < d.hunks.length; ) {
        let del = 0, add = 0;
        while (i < d.hunks.length && d.hunks[i].t === "del") { del++; i++; }
        while (i < d.hunks.length && d.hunks[i].t === "add") { add++; i++; }
        changed += Math.min(del, add);
        if (!del && !add) i++;
      }
      const la = a.split("\n").length, lb = b.split("\n").length;
      const same = Math.max(0, la - d.removed);
      const cleanPatch = (p: string) => p.replace(/^=+\n/, "").replace(/\t$/gm, "");
      const text = d.same ? `No differences${bool(opts.ws) || bool(opts.case) ? " (ignoring " + [bool(opts.ws) && "whitespace", bool(opts.case) && "case"].filter(Boolean).join(" and ") + ")" : ""}.` : cleanPatch(patch);
      return {
        text,
        filename: "changes.diff",
        views: [
          { label: "Diff", out: d.same ? { kind: "status", ok: true, title: "Files are identical", detail: text } : { kind: "diff", hunks: d.hunks, mode: str(opts.view) === "unified" ? "unified" : "split" } },
          { label: "Patch", out: { kind: "text", text, lang: "text" } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: "Added", value: d.added - changed, tone: "ok" },
                { label: "Removed", value: d.removed - changed, tone: "bad" },
                { label: "Changed", value: changed, tone: "warn" },
                { label: "Unchanged", value: same },
                { label: "Lines (A → B)", value: `${la} → ${lb}` },
                { label: "Similarity", value: `${Math.round((same / Math.max(1, Math.max(la, lb))) * 100)}%`, tone: "info" },
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "Config change", inputs: { a: DIFF_A, b: DIFF_B }, note: "Changed values highlighted word-by-word; the Patch tab holds a git-style unified diff." },
      { label: "Refactor (unified)", inputs: { a: CODE_A, b: CODE_B }, opts: { view: "unified", inline: "char" }, note: "Character-level highlighting inside changed lines." },
      { label: "Whitespace only", inputs: { a: "function add(a, b) {\n  return a + b;\n}", b: "function add(a,  b) {\n\treturn a + b;   \n}" }, opts: { ws: true }, note: "Indentation and spacing changes disappear with Ignore whitespace on." },
      { label: "Case-insensitive", inputs: { a: "SELECT id, name FROM users WHERE active = TRUE;", b: "select id, name from users where active = true;" }, opts: { case: true } },
      { label: "Full context", inputs: { a: CSV_ROWS, b: CSV_ROWS.replace("team", "enterprise").replace("3,Linus Torvalds,linus@example.org,FI,free\n", "") + "\n5,Katherine Johnson,katherine@example.com,US,pro" }, opts: { context: "all", inline: "none" } },
    ],
    steps: ["Paste or drop the original on top and the changed version below.", "Choose split or unified view, context lines and inline highlighting.", "Copy or download the Patch tab as a .diff file."],
  },

  "markdown-editor": {
    inputs: [{ id: "md", label: "Markdown", lang: "markdown", wrap: true, placeholder: "# Write Markdown here" }],
    options: [
      { id: "html", label: "Allow HTML", type: "toggle", default: false, hint: "Raw HTML is rendered but still sanitised (no scripts or event handlers)" },
      { id: "linkify", label: "Linkify", type: "toggle", default: true },
      { id: "typographer", label: "Typographer", type: "toggle", default: true, hint: "Smart quotes, dashes (--, ---) and ellipses" },
      { id: "breaks", label: "Line breaks", type: "toggle", default: false, hint: "Treat single newlines as <br>" },
      { id: "footnotes", label: "Footnotes", type: "toggle", default: true },
      { id: "anchors", label: "Heading anchors", type: "toggle", default: false },
      { id: "full", label: "Full HTML document", type: "toggle", default: false, hint: "The HTML output becomes a standalone page with embedded CSS" },
    ],
    outLang: "html",
    async run({ inputs, opts }) {
      const src = inputs.md;
      const M = await import("./lib/C-markdown");
      const r = await M.renderMarkdown(src, { html: bool(opts.html), linkify: bool(opts.linkify), typographer: bool(opts.typographer), breaks: bool(opts.breaks), tasks: true, anchors: bool(opts.anchors), footnotes: bool(opts.footnotes) });
      let html = r.html;
      if (bool(opts.html)) {
        const DOMPurify = ((await import("dompurify")) as { default: { sanitize: (s: string, c?: object) => string } }).default;
        if (typeof DOMPurify.sanitize === "function") html = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
      }
      const title = r.headings[0]?.text ?? "Document";
      const { escHtml } = await util();
      const text = bool(opts.full) ? `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escHtml(title)}</title>\n<style>${M.DOC_CSS}</style>\n</head>\n<body>\n${html}</body>\n</html>` : html.trimEnd();
      const toc = M.tocMarkdown(r.headings);
      const words = r.stats.words;
      const mins = words / 230;
      return {
        text,
        lang: "html",
        filename: bool(opts.full) ? "document.html" : "fragment.html",
        views: [
          { label: "Preview", out: { kind: "html", html, css: M.MD_CSS } },
          { label: "HTML", out: { kind: "text", text, lang: "html" } },
          { label: `Contents (${r.headings.length})`, out: r.headings.length ? { kind: "table", columns: ["level", "heading", "anchor"], rows: r.headings.map((h) => [`H${h.level}`, "  ".repeat(h.level - 1) + h.text, "#" + h.id]) } : { kind: "status", ok: false, title: "No headings", detail: "Add # headings to build a table of contents." } },
          { label: "TOC (Markdown)", out: { kind: "text", text: toc || "(no headings)", lang: "markdown" } },
          {
            label: "Stats",
            out: {
              kind: "stats",
              items: [
                { label: "Words", value: words, tone: "info" },
                { label: "Reading time", value: mins < 1 ? "< 1 min" : `${Math.round(mins)} min` },
                { label: "Characters", value: src.length },
                { label: "Headings", value: r.headings.length },
                { label: "Links", value: r.stats.links },
                { label: "Images", value: r.stats.images },
                { label: "Code blocks", value: r.stats.code },
                { label: "Tables", value: r.stats.tables },
                { label: "Lists", value: r.stats.lists },
                { label: "Quotes", value: r.stats.quotes },
                ...(r.stats.tasks ? [{ label: "Tasks done", value: `${r.stats.done} / ${r.stats.tasks}`, tone: (r.stats.done === r.stats.tasks ? "ok" : "warn") as "ok" | "warn" }] : []),
                ...(r.stats.footnotes ? [{ label: "Footnotes", value: r.stats.footnotes }] : []),
              ],
            },
          },
        ],
      };
    },
    examples: [
      { label: "README", inputs: { md: README }, note: "Badges, a code fence, an aligned table and a blockquote — a typical project README." },
      { label: "Task list", inputs: { md: MD_TASKS }, note: "GFM task lists (- [ ] / - [x]), nested, plus strikethrough. Stats counts the tasks done." },
      { label: "Code fences", inputs: { md: MD_CODE }, note: "Fenced blocks keep their language as a class (language-js) for highlighters." },
      { label: "Blog post + footnotes", inputs: { md: MD_BLOG }, opts: { anchors: true }, note: "Footnotes, smart quotes and dashes from the typographer, autolinked URLs and hover anchors on headings." },
      { label: "Raw HTML (sanitised)", inputs: { md: MD_HTML }, opts: { html: true }, note: "HTML is allowed, but <script>, onclick and javascript: links are stripped." },
      { label: "Full document", inputs: { md: README }, opts: { full: true, breaks: true }, note: "Download the HTML tab as a standalone page with GitHub-like CSS (and dark mode)." },
    ],
    steps: ["Write Markdown on the left — the preview updates as you type.", "Toggle HTML, linkify, typographer, line breaks and footnotes.", "Copy the HTML (fragment or full document), or grab the table of contents."],
  },
};

/** Map hunks of a patch built from normalised text back to the original lines (same line counts). */
function remapPatch(patch: string, a: string, b: string): string {
  const A = a.split("\n"), B = b.split("\n");
  const out: string[] = [];
  let ia = 0, ib = 0;
  for (const line of patch.split("\n")) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { ia = +h[1] - 1; ib = +h[2] - 1; out.push(line); continue; }
    if (/^(---|\+\+\+|Index:|====)/.test(line) || line.startsWith("\\")) { out.push(line); continue; }
    if (line.startsWith("-")) out.push("-" + (A[ia++] ?? ""));
    else if (line.startsWith("+")) out.push("+" + (B[ib++] ?? ""));
    else if (line.startsWith(" ")) { out.push(" " + (A[ia++] ?? "")); ib++; }
    else out.push(line);
  }
  return out.join("\n");
}

export default specs;

export type { Result };
