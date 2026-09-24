import { isNode } from "./lib/vendor";
import { ToolError, bool, num, str, type Example, type Result, type SpecModule, type ToolSpec, type View } from "./types";
import type { LiteLang } from "./lib/E-lite";

/* ── Python ──────────────────────────────────────────────────────────── */

const PY_BASICS = `# Variables, f-strings and control flow
name = "Ada"
langs = ["Python", "Rust", "Go"]

print(f"Hello, {name}! You know {len(langs)} languages.")
for i, lang in enumerate(langs, start=1):
    marker = "★" if lang == "Python" else " "
    print(f"{i}. {lang:<8}{marker}")

total = sum(n * n for n in range(1, 11))
print("Sum of squares 1..10 =", total)

# The value of the last expression is shown too:
{"name": name, "langs": langs, "upper": name.upper()}`;

const PY_CLASSES = `from dataclasses import dataclass, field
from typing import ClassVar
import math


@dataclass(order=True)
class Point:
    x: float
    y: float
    origin: ClassVar["Point"]

    def distance(self, other: "Point") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def __add__(self, other: "Point") -> "Point":
        return Point(self.x + other.x, self.y + other.y)


Point.origin = Point(0, 0)


@dataclass
class Polygon:
    name: str
    points: list[Point] = field(default_factory=list)

    @property
    def perimeter(self) -> float:
        pts = self.points + self.points[:1]
        return sum(a.distance(b) for a, b in zip(pts, pts[1:]))


square = Polygon("square", [Point(0, 0), Point(0, 2), Point(2, 2), Point(2, 0)])
print(square)
print(f"perimeter = {square.perimeter:.2f}")
print("sorted:", sorted([Point(2, 1), Point(1, 5), Point(1, 2)]))
Point(1, 2) + Point(3, 4)`;

const PY_GEN = `# Comprehensions and generators
words = "the quick brown fox jumps over the lazy dog the end".split()

lengths = {w: len(w) for w in set(words)}
long_words = [w.upper() for w in words if len(w) > 4]
pairs = [(a, b) for a in range(1, 4) for b in "xy"]

print("lengths :", dict(sorted(lengths.items())))
print("long    :", long_words)
print("pairs   :", pairs)


def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b


def take(n, it):
    for _, x in zip(range(n), it):
        yield x


print("fib     :", list(take(12, fibonacci())))
evens = (x for x in fibonacci() if x % 2 == 0)
print("even fib:", [next(evens) for _ in range(6)])

# Generator expressions are lazy: this sums a million squares without a list
sum(x * x for x in range(1_000_000))`;

const PY_STDLIB = `import json, re, statistics
from collections import Counter, defaultdict, namedtuple
from datetime import date, datetime, timedelta
from itertools import groupby, pairwise, accumulate

orders = json.loads("""[
  {"id": "A-1", "customer": "ada",   "total": 42.5,  "day": "2026-09-21"},
  {"id": "A-2", "customer": "grace", "total": 18.0,  "day": "2026-09-21"},
  {"id": "A-3", "customer": "ada",   "total": 99.99, "day": "2026-09-22"},
  {"id": "A-4", "customer": "linus", "total": 7.25,  "day": "2026-09-23"}
]""")

totals = [o["total"] for o in orders]
print("mean / median:", round(statistics.mean(totals), 2), statistics.median(totals))
print("by customer  :", Counter(o["customer"] for o in orders).most_common())

per_day = defaultdict(float)
for o in orders:
    per_day[o["day"]] += o["total"]
print("running total:", list(accumulate(per_day.values())))

for day, group in groupby(orders, key=lambda o: o["day"]):
    print(" ", day, [o["id"] for o in group])

release = date(2026, 9, 24)
print("in 90 days   :", release + timedelta(days=90), "| weekday:", release.strftime("%A"))
print("gaps (days)  :", [(b - a).days for a, b in pairwise(sorted({date.fromisoformat(o["day"]) for o in orders}))])

Email = namedtuple("Email", "user domain")
text = "Contact ada@example.com or grace@navy.example.mil"
[Email(*m) for m in re.findall(r"([\\w.]+)@([\\w.]+)", text)]`;

const PY_ALGO = `import time
from functools import lru_cache


def sieve(n: int) -> list[int]:
    """Sieve of Eratosthenes."""
    is_prime = bytearray([1]) * (n + 1)
    is_prime[0:2] = b"\\x00\\x00"
    for p in range(2, int(n ** 0.5) + 1):
        if is_prime[p]:
            is_prime[p * p :: p] = bytes(len(range(p * p, n + 1, p)))
    return [i for i, v in enumerate(is_prime) if v]


def fib_slow(n):
    return n if n < 2 else fib_slow(n - 1) + fib_slow(n - 2)


@lru_cache(maxsize=None)
def fib_fast(n):
    return n if n < 2 else fib_fast(n - 1) + fib_fast(n - 2)


def timed(label, fn, *args):
    t0 = time.perf_counter()
    result = fn(*args)
    print(f"{label:<18} {(time.perf_counter() - t0) * 1000:8.2f} ms")
    return result


primes = timed("sieve(1_000_000)", sieve, 1_000_000)
print(f"  {len(primes):,} primes, largest {primes[-1]:,}")
timed("fib_slow(24)", fib_slow, 24)
print("  fib_fast(200) =", timed("fib_fast(200)", fib_fast, 200))`;

const PY_INPUT = `# input() reads from the stdin box below, one line per call
n = int(input("How many scores? "))
scores = []
for i in range(n):
    name, score = input(f"Score {i + 1} (name points): ").split()
    scores.append((name, int(score)))

scores.sort(key=lambda s: s[1], reverse=True)
width = max(len(n) for n, _ in scores)
print()
for rank, (name, pts) in enumerate(scores, 1):
    print(f"{rank}. {name:<{width}}  {pts:>4}  {'█' * (pts // 10)}")

best = scores[0]
f"Winner: {best[0]} with {best[1]} points"`;

const PY_ERROR = `def parse_price(text: str) -> float:
    amount, currency = text.split()
    return float(amount)


def total(items):
    return sum(parse_price(i) for i in items)


cart = ["12.50 EUR", "3.99 EUR", "free"]
print("Items:", cart)
print("Total:", total(cart))`;

/* ── JavaScript ──────────────────────────────────────────────────────── */

const JS_ARRAYS = `const orders = [
  { id: "A-1001", customer: "Ada", total: 42.5, status: "shipped" },
  { id: "A-1002", customer: "Grace", total: 18, status: "pending" },
  { id: "A-1003", customer: "Linus", total: 99.99, status: "shipped" },
  { id: "A-1004", customer: "Ada", total: 7.25, status: "cancelled" },
];

const shipped = orders.filter((o) => o.status === "shipped");
console.log("shipped ids:", shipped.map((o) => o.id));

const revenue = shipped.reduce((sum, o) => sum + o.total, 0);
console.log("revenue: %s", revenue.toFixed(2));

const byCustomer = Object.groupBy(orders, (o) => o.customer);
console.table(Object.entries(byCustomer).map(([name, list]) => ({ name, orders: list.length, spent: list.reduce((s, o) => s + o.total, 0) })));

console.log(orders.toSorted((a, b) => b.total - a.total).at(0));
console.log(orders.some((o) => o.total > 90), orders.every((o) => o.total > 5));

// The last expression's value is shown after the logs:
orders.findLast((o) => o.customer === "Ada")`;

const JS_ASYNC = `const sleep = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

console.time("all");
console.log("start");

// Top-level await works — the code runs inside an async function.
const first = await sleep(150, "first");
console.log("after 150 ms:", first);

const results = await Promise.all([sleep(200, "a"), sleep(100, "b"), sleep(50, "c")]);
console.log("Promise.all (in order):", results);

const winner = await Promise.race([sleep(120, "slow"), sleep(40, "fast")]);
console.log("Promise.race:", winner);

const settled = await Promise.allSettled([sleep(10, "ok"), Promise.reject(new Error("nope"))]);
console.table(settled.map((s) => ({ status: s.status, value: s.value ?? s.reason.message })));

for await (const n of (async function* () { for (let i = 1; i <= 3; i++) { await sleep(30); yield i * i; } })()) {
  console.log("async generator ->", n);
}
console.timeEnd("all");`;

const JS_CLASSES = `class Shape {
  static count = 0;
  #id;
  constructor(name) {
    this.name = name;
    this.#id = ++Shape.count;
  }
  get id() { return this.#id; }
  area() { throw new Error("not implemented"); }
  toString() { return \`\${this.name}#\${this.#id} area=\${this.area().toFixed(2)}\`; }
}

class Circle extends Shape {
  constructor(r) { super("circle"); this.r = r; }
  area() { return Math.PI * this.r ** 2; }
}

class Rect extends Shape {
  constructor(w, h) { super("rect"); Object.assign(this, { w, h }); }
  area() { return this.w * this.h; }
}

class Drawing {
  #shapes = [];
  add(...s) { this.#shapes.push(...s); return this; }
  *[Symbol.iterator]() { yield* this.#shapes.toSorted((a, b) => a.area() - b.area()); }
}

const d = new Drawing().add(new Circle(1), new Rect(2, 3), new Circle(0.5));
for (const s of d) console.log(String(s));

function* range(start, end, step = 1) {
  for (let i = start; i < end; i += step) yield i;
}
console.log([...range(0, 20, 5)], Shape.count);
console.log(new Rect(1, 2));
[...d].map((s) => s.id)`;

const JS_INTL = `const n = 1234567.891;
const amount = 4999.5;
const when = new Date(Date.UTC(2026, 8, 24, 14, 30));

for (const locale of ["en-US", "de-DE", "fr-FR", "ja-JP", "ar-EG", "hi-IN"]) {
  console.log(
    locale.padEnd(6),
    new Intl.NumberFormat(locale).format(n).padEnd(16),
    new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(amount).padEnd(14),
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(when)
  );
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
console.log(rtf.format(-1, "day"), "|", rtf.format(3, "week"), "|", rtf.format(0, "year"));

const list = new Intl.ListFormat("en", { type: "conjunction" });
console.log(list.format(["Ada", "Grace", "Linus"]));

const plural = new Intl.PluralRules("en", { type: "ordinal" });
const suffix = { one: "st", two: "nd", few: "rd", other: "th" };
console.log([1, 2, 3, 4, 11, 21, 22, 103].map((k) => k + suffix[plural.select(k)]).join(" "));

console.log(new Intl.NumberFormat("en", { notation: "compact" }).format(12_345_678));
console.log(["zebra", "Äpfel", "apple", "Zürich"].sort(new Intl.Collator("de").compare));`;

const JS_MAPSET = `const visits = ["/home", "/docs", "/home", "/pricing", "/docs", "/home", "/blog"];

const unique = new Set(visits);
console.log(unique, "size:", unique.size);

const counts = new Map();
for (const page of visits) counts.set(page, (counts.get(page) ?? 0) + 1);
console.log(counts);
console.log("top page:", [...counts].sort((a, b) => b[1] - a[1])[0]);

const a = new Set([1, 2, 3, 4]), b = new Set([3, 4, 5]);
console.log("union", a.union(b), "intersection", a.intersection(b), "difference", a.difference(b));

// WeakMap keeps private data per object without leaking it
const meta = new WeakMap();
const user = { name: "Ada" };
meta.set(user, { lastSeen: "2026-09-24" });
console.log(meta.get(user));

// Map preserves insertion order and allows any key type
const m = new Map([[1, "number"], ["1", "string"], [true, "boolean"], [{}, "object"]]);
console.table([...m].map(([k, v]) => ({ key: String(k), type: typeof k, value: v })));
Object.fromEntries(counts)`;

const JS_REGEX = `const log = \`2026-09-24T10:00:01Z INFO  GET /api/users 200 14ms
2026-09-24T10:00:02Z WARN  GET /api/search 200 812ms
2026-09-24T10:00:03Z ERROR POST /api/orders 500 91ms\`;

const re = /^(?<ts>\\S+) (?<level>\\w+)\\s+(?<method>[A-Z]+) (?<path>\\S+) (?<status>\\d{3}) (?<ms>\\d+)ms$/gm;
const rows = [...log.matchAll(re)].map((m) => ({ ...m.groups, ms: Number(m.groups.ms) }));
console.table(rows, ["level", "method", "path", "status", "ms"]);

const slow = rows.filter((r) => r.ms > 500).map((r) => r.path);
console.log("slow:", slow);

console.log("2026-09-24".replace(/(\\d+)-(\\d+)-(\\d+)/, "$3/$2/$1"));
console.log("camelCaseString".replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()));
console.log("a1b22c333".split(/\\d+/));
console.log(/(?<=\\$)\\d+(\\.\\d\\d)?/.exec("Total: $42.50")?.[0]);
console.log("Ünïcödé".normalize("NFD").replace(/\\p{Diacritic}/gu, ""));`;

const JS_PERF = `function fibRecursive(n) { return n < 2 ? n : fibRecursive(n - 1) + fibRecursive(n - 2); }
function fibLoop(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a; }

function bench(label, fn, runs = 5) {
  const times = [];
  let result;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    result = fn();
    times.push(performance.now() - t0);
  }
  times.sort((x, y) => x - y);
  return { label, result, median_ms: +times[runs >> 1].toFixed(3), best_ms: +times[0].toFixed(3) };
}

console.table([
  bench("fibRecursive(27)", () => fibRecursive(27)),
  bench("fibLoop(27)", () => fibLoop(27)),
  bench("sort 100k numbers", () => Array.from({ length: 1e5 }, (_, i) => (i * 7919) % 100003).sort((a, b) => a - b).length),
  bench("join 100k strings", () => Array.from({ length: 1e5 }, (_, i) => "x" + i).join(",").length),
]);

console.count("done");
console.assert(fibLoop(10) === 55, "fibLoop is wrong");
console.assert(fibLoop(10) === 56, "expected failure: 55 !== 56");`;

const JS_ERROR = `function parseConfig(text) {
  const cfg = JSON.parse(text);
  return { port: cfg.server.port, host: cfg.server.host ?? "localhost" };
}

console.log(parseConfig('{"server": {"port": 8080}}'));

console.warn("next one is missing the server block…");
const cfg = parseConfig('{"port": 8080}');
console.log("never printed", cfg);`;

/* ── Go ──────────────────────────────────────────────────────────────── */

const GO_HTTP = `package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// Todo is one item in the list.
type Todo struct {
	ID int \`json:"id"\`
	Title string \`json:"title"\`
	Done bool \`json:"done"\`
	CreatedAt time.Time \`json:"createdAt"\`
}

type store struct {
	mu sync.RWMutex
	todos []Todo
	nextID int
}

func (s *store) list(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(s.todos); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (s *store) create(w http.ResponseWriter, r *http.Request) {
	var t Todo
	if err := json.NewDecoder(r.Body).Decode(&t); err != nil {
		http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	s.nextID++
	t.ID, t.CreatedAt = s.nextID, time.Now()
	s.todos = append(s.todos, t)
	s.mu.Unlock()
	w.Header().Set("Location", "/todos/"+strconv.Itoa(t.ID))
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(t)
}

func main() {
	s := &store{}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /todos", s.list)
	mux.HandleFunc("POST /todos", s.create)
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", mux))
}
`;

const GO_CHAN = `package main

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type result struct {
	job int
	sum int
	took time.Duration
}

func worker(ctx context.Context, id int, jobs <-chan int, out chan<- result, wg *sync.WaitGroup) {
	defer wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case n, ok := <-jobs:
			if !ok {
				return
			}
			start := time.Now()
			sum := 0
			for i := 1; i <= n; i++ {
				sum += i * i
			}
			out <- result{job: n, sum: sum, took: time.Since(start)}
		}
	}
}

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	jobs := make(chan int, 10)
	out := make(chan result, 10)
	var wg sync.WaitGroup
	for w := 1; w <= 3; w++ {
		wg.Add(1)
		go worker(ctx, w, jobs, out, &wg)
	}
	for _, n := range []int{10, 100, 1000, 10000} {
		jobs <- n
	}
	close(jobs)

	go func() {
		wg.Wait()
		close(out)
	}()
	for r := range out {
		fmt.Printf("job %5d -> %d (%s)\\n", r.job, r.sum, r.took)
	}
}
`;

const GO_GENERICS = `package collections

import "cmp"

// Number is any integer or float type.
type Number interface {
	~int | ~int64 | ~float64
}

type Stack[T any] struct {
	items []T
}

func (s *Stack[T]) Push(v T) { s.items = append(s.items, v) }

func (s *Stack[T]) Pop() (T, bool) {
	var zero T
	if len(s.items) == 0 {
		return zero, false
	}
	v := s.items[len(s.items)-1]
	s.items = s.items[:len(s.items)-1]
	return v, true
}

func Map[T, U any](xs []T, f func(T) U) []U {
	out := make([]U, 0, len(xs))
	for _, x := range xs {
		out = append(out, f(x))
	}
	return out
}

func Sum[T Number](xs []T) (total T) {
	for _, x := range xs {
		total += x
	}
	return
}

func MaxBy[T any, K cmp.Ordered](xs []T, key func(T) K) (best T) {
	for i, x := range xs {
		if i == 0 || key(x) > key(best) {
			best = x
		}
	}
	return best
}
`;

const GO_MESSY = `package main
import (
"fmt"
"strings"
)
type Config struct{
Name string
Port int
Tags []string
}
func greet(c Config)string{
if c.Port==0{
c.Port=8080
}else if c.Port<1024{
fmt.Println("privileged port")
}
switch{
case c.Name=="":
return "anonymous"
default:
return fmt.Sprintf("%s:%d [%s]",c.Name,c.Port,strings.Join(c.Tags,","))
}
}
func main(){
cfg:=Config{Name:"api",Port:443,Tags:[]string{"prod","eu"}}
fmt.Println(greet(cfg))
}
`;

const GO_BROKEN = `package main

import (
	"fmt"
	"os"
	"strings"
)

counter := 0

func load(path string) string
{
	data, err := os.ReadFile(path)
	fmt.Println("read", len(data), "bytes")
	for _, name := range []string{"a", "b"} {
		f, _ := os.Open(name)
		defer f.Close()
	}
	fmt.Println("total: %d", len(data))
	return string(data
}
`;

/* ── Rust ────────────────────────────────────────────────────────────── */

const RUST_SHAPES = `use std::fmt;

#[derive(Debug, Clone, PartialEq)]
enum Shape {
    Circle { r: f64 },
    Rect { w: f64, h: f64 },
    Triangle(f64, f64, f64),
}

trait Area {
    fn area(&self) -> f64;
    fn describe(&self) -> String {
        format!("area {:.2}", self.area())
    }
}

impl Area for Shape {
    fn area(&self) -> f64 {
        match *self {
            Shape::Circle { r } => std::f64::consts::PI * r * r,
            Shape::Rect { w, h } => w * h,
            Shape::Triangle(a, b, c) => {
                let s = (a + b + c) / 2.0;
                (s * (s - a) * (s - b) * (s - c)).sqrt()
            }
        }
    }
}

impl fmt::Display for Shape {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Shape::Circle { r } => write!(f, "circle(r={r})"),
            Shape::Rect { w, h } => write!(f, "rect({w}x{h})"),
            Shape::Triangle(..) => write!(f, "triangle"),
        }
    }
}

fn largest<'a>(shapes: &'a [Shape]) -> Option<&'a Shape> {
    shapes.iter().max_by(|a, b| a.area().total_cmp(&b.area()))
}

fn main() {
    let shapes = vec![
        Shape::Circle { r: 1.5 },
        Shape::Rect { w: 2.0, h: 3.5 },
        Shape::Triangle(3.0, 4.0, 5.0),
    ];
    for s in &shapes {
        println!("{s}: {}", s.describe());
    }
    if let Some(big) = largest(&shapes) {
        println!("largest: {big}");
    }
}
`;

const RUST_RESULT = `use std::collections::HashMap;
use std::fmt;
use std::num::ParseIntError;

#[derive(Debug)]
pub enum ConfigError {
    Missing(String),
    BadNumber { key: String, source: ParseIntError },
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ConfigError::Missing(k) => write!(f, "missing key {k}"),
            ConfigError::BadNumber { key, source } => write!(f, "{key}: {source}"),
        }
    }
}

impl std::error::Error for ConfigError {}

pub struct Config {
    pub host: String,
    pub port: u16,
    pub workers: usize,
}

fn parse(text: &str) -> HashMap<&str, &str> {
    text.lines()
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim(), v.trim()))
        .collect()
}

fn number(map: &HashMap<&str, &str>, key: &str) -> Result<u16, ConfigError> {
    let raw = map.get(key).ok_or_else(|| ConfigError::Missing(key.to_string()))?;
    raw.parse().map_err(|source| ConfigError::BadNumber { key: key.into(), source })
}

pub fn load(text: &str) -> Result<Config, ConfigError> {
    let map = parse(text);
    Ok(Config {
        host: map.get("host").unwrap_or(&"127.0.0.1").to_string(),
        port: number(&map, "port")?,
        workers: number(&map, "workers").unwrap_or(4) as usize,
    })
}
`;

const RUST_ITER = `use std::collections::BTreeMap;

struct Fibonacci {
    curr: u64,
    next: u64,
}

impl Iterator for Fibonacci {
    type Item = u64;

    fn next(&mut self) -> Option<Self::Item> {
        let r = self.curr;
        self.curr = self.next;
        self.next = r.checked_add(self.next)?;
        Some(r)
    }
}

fn word_counts(text: &str) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for w in text.split(|c: char| !c.is_alphanumeric()).filter(|w| !w.is_empty()) {
        *counts.entry(w.to_lowercase()).or_insert(0) += 1;
    }
    counts
}

fn main() {
    let evens: Vec<u64> = Fibonacci { curr: 0, next: 1 }
        .filter(|n| n % 2 == 0)
        .take_while(|&n| n < 1_000_000)
        .collect();
    println!("even fibs: {evens:?}");

    let text = "the cat sat on the mat; the end";
    let top = word_counts(text)
        .into_iter()
        .max_by_key(|(_, n)| *n);
    println!("most common: {top:?}");

    let (small, big): (Vec<i32>, Vec<i32>) = (1..=10).partition(|n| *n <= 5);
    println!("{small:?} {big:?}");
}
`;

const RUST_MESSY = `use std::collections::HashMap;
fn main(){
let mut scores:HashMap<&str,u32>=HashMap::new();
for (name,pts) in [("ada",90),("grace",85),("ada",7)]{
*scores.entry(name).or_insert(0)+=pts;
}
let mut v:Vec<_>=scores.into_iter().collect();
v.sort_by(|a,b|b.1.cmp(&a.1));
for (i,(name,pts)) in v.iter().enumerate(){
match i{
0=>println!("winner {} with {}",name,pts),
_=>println!("{} {}",name,pts),
}
}
}
`;

const RUST_BROKEN = `use std::fs;

fn read_numbers(path: &String) -> Vec<i64> {
    let text = fs::read_to_string(path).unwrap();
    text.lines().map(|l| l.parse().expect("not a number")).collect()
}

fn main() {
    let nums = read_numbers(&"numbers.txt".to_string())
    let total: i64 = nums.iter().sum();
    println("total = {}", total);
    let raw = &nums as *const Vec<i64>;
    unsafe {
        println!("{}", (*raw).len());
    }
    if total > 100 {
        todo!()
`;

/* ── Java ────────────────────────────────────────────────────────────── */

const JAVA_STREAMS = `package com.example.orders;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class OrderReport {

    public record Order(String id, String customer, BigDecimal total, LocalDate day, Status status) {}

    public enum Status { PENDING, SHIPPED, CANCELLED }

    public interface Discount {
        BigDecimal apply(BigDecimal amount);

        static Discount percent(int p) {
            return amount -> amount.multiply(BigDecimal.valueOf(100 - p)).divide(BigDecimal.valueOf(100));
        }
    }

    private final List<Order> orders;

    public OrderReport(List<Order> orders) {
        this.orders = List.copyOf(orders);
    }

    public Map<String, BigDecimal> revenueByCustomer() {
        return orders.stream()
                .filter(o -> o.status() == Status.SHIPPED)
                .collect(Collectors.groupingBy(Order::customer,
                        Collectors.reducing(BigDecimal.ZERO, Order::total, BigDecimal::add)));
    }

    public List<Order> topOrders(int n) {
        return orders.stream()
                .sorted(Comparator.comparing(Order::total).reversed())
                .limit(n)
                .toList();
    }

    public static void main(String[] args) {
        var report = new OrderReport(List.of(
                new Order("A-1", "ada", new BigDecimal("42.50"), LocalDate.of(2026, 9, 21), Status.SHIPPED),
                new Order("A-2", "grace", new BigDecimal("18.00"), LocalDate.of(2026, 9, 21), Status.PENDING),
                new Order("A-3", "ada", new BigDecimal("99.99"), LocalDate.of(2026, 9, 22), Status.SHIPPED)));
        System.out.println(report.revenueByCustomer());
        report.topOrders(2).forEach(System.out::println);
        System.out.println(Discount.percent(10).apply(new BigDecimal("50")));
    }
}
`;

const JAVA_SEALED = `package com.example.shapes;

import java.util.List;

public sealed interface Shape permits Circle, Rect, Triangle {
    double area();

    static String describe(Shape s) {
        return switch (s) {
            case Circle c when c.r() == 0 -> "a point";
            case Circle c -> "circle r=" + c.r();
            case Rect(double w, double h) when w == h -> "square " + w;
            case Rect r -> "rect " + r.w() + "x" + r.h();
            case Triangle t -> "triangle";
        };
    }
}

record Circle(double r) implements Shape {
    public double area() { return Math.PI * r * r; }
}

record Rect(double w, double h) implements Shape {
    Rect {
        if (w < 0 || h < 0) throw new IllegalArgumentException("negative size");
    }
    public double area() { return w * h; }
}

record Triangle(double a, double b, double c) implements Shape {
    public double area() {
        double s = (a + b + c) / 2;
        return Math.sqrt(s * (s - a) * (s - b) * (s - c));
    }
}
`;

const JAVA_MESSY = `import java.util.*;
public class Inventory{
private Map<String,Integer> stock=new HashMap<>();
public void add(String sku,int qty){
if(qty<=0){throw new IllegalArgumentException("qty must be positive");}
stock.merge(sku,qty,Integer::sum);
}
public String level(String sku){
int n=stock.getOrDefault(sku,0);
switch(n){
case 0:
return "out of stock";
case 1:
case 2:
return "low";
default:
return "ok";
}
}
public static void main(String[] args){
Inventory inv=new Inventory();
inv.add("KB-01",3);inv.add("MS-02",1);
for(String s:List.of("KB-01","MS-02","XX-99")){
System.out.println(s+": "+inv.level(s));
}
}
}
`;

const JAVA_BROKEN = `import java.util.ArrayList;
import java.util.List;

public class UserService {
    private List users = new ArrayList();

    public boolean isAdmin(String role) {
        return role == "admin";
    }

    public void load(String path) {
        try {
            users.add(java.nio.file.Files.readString(java.nio.file.Path.of(path)));
        } catch (Exception e) {
        }
    }

    public boolean equals(Object o) {
        return o instanceof UserService;
    }

    static void main(String args) {
        System.out.println("users: " + new UserService().users.size();
    }
}

public class Extra {}
`;

/* ── lite spec factory ───────────────────────────────────────────────── */

function liteSpec(lang: LiteLang, name: string, examples: Example[]): ToolSpec {
  return {
    inputs: [{ id: "code", label: `${name} source`, lang }],
    options: [
      { id: "indent", label: "Indent", type: "segment", choices: [["auto", lang === "go" ? "Tabs (gofmt)" : "4 spaces"], ["tabs", "Tabs"], ["2", "2"], ["4", "4"]].filter((c, i) => i === 0 || c[0] !== (lang === "go" ? "tabs" : "4")) as [string, string][], default: "auto" },
      { id: "spacing", label: "Normalise spacing", type: "toggle", default: true, hint: "Spaces around = := == -> after commas, before {, } else {" + (lang === "go" ? ", and gofmt column alignment" : "") },
      { id: "hints", label: "Style hints", type: "toggle", default: true, hint: "Include info-level suggestions in Issues" },
    ],
    outLang: lang,
    async run({ inputs, opts }) {
      const { lex, formatLite, lint, outline, stats } = await import("./lib/E-lite");
      const src = inputs.code ?? "";
      if (!src.trim()) throw new ToolError(`Paste some ${name} code.`);
      const lx = lex(src.replace(/\r\n?/g, "\n"), lang);
      const syms = outline(lx, lang);
      let issues = lint(lx, lang, syms);
      if (!bool(opts.hints)) issues = issues.filter((i) => i.level !== "info");
      const errors = issues.filter((i) => i.level === "error").length;
      const warnings = issues.filter((i) => i.level === "warning").length;
      const text = formatLite(src, lang, { indent: str(opts.indent, "auto") as "auto", spacing: bool(opts.spacing) });
      const st = stats(lx, syms);
      const views: View[] = [
        { label: "Formatted", out: { kind: "text", text, lang } },
        { label: `Issues (${errors + warnings})`, out: { kind: "issues", items: issues.length ? issues : [{ level: "ok", message: "No problems found by the offline checks." }] } },
        { label: `Outline (${syms.length})`, out: { kind: "table", columns: ["line", "kind", "name", "in", "signature"], rows: syms.map((s) => [s.line, s.kind, s.name, s.parent || null, s.signature]) } },
        {
          label: "Stats",
          out: {
            kind: "stats",
            items: [
              { label: "Lines", value: st.lines },
              { label: "Code", value: st.code, tone: "info" },
              { label: "Comments", value: st.comment },
              { label: "Blank", value: st.blank },
              { label: lang === "java" ? "Methods" : "Functions", value: st.fns },
              { label: "Types", value: st.types },
              { label: "Imports", value: st.imports },
              { label: "Max nesting", value: st.maxDepth, tone: st.maxDepth > 5 ? "warn" : undefined },
              { label: "Longest line", value: st.longest, tone: st.longest > 120 ? "warn" : undefined },
              { label: "Errors", value: errors, tone: errors ? "bad" : "ok" },
              { label: "Warnings", value: warnings, tone: warnings ? "warn" : "ok" },
              { label: "TODO / FIXME", value: st.todos },
            ],
          },
        },
      ];
      const res: Result = { text, views, filename: lang === "go" ? "main.go" : lang === "rust" ? "main.rs" : `${syms.find((s) => ["class", "interface", "record", "enum"].includes(s.kind) && /public/.test(s.signature))?.name ?? "Main"}.java`, notes: errors ? [`${errors} error${errors === 1 ? "" : "s"} found — see Issues. The code was still re-indented.`] : undefined };
      return res;
    },
    examples,
    steps: [`Paste ${name} code or pick an example.`, "Formatted shows the re-indented code; Issues lists problems with line numbers.", "Outline lists every symbol; Stats counts lines, functions and nesting."],
    tips: ["This is an offline lite mode: no compiler runs, so type errors are not detected — the checks are fast heuristics.", "Strings, raw strings, characters and comments are never changed by the formatter."],
  };
}

/* ── specs ───────────────────────────────────────────────────────────── */

const specs: SpecModule = {
  "python-playground-pyodide": {
    inputs: [
      { id: "code", label: "Python", lang: "python", placeholder: "print('hello from CPython in your browser')" },
      { id: "stdin", label: "stdin (one line per input())", lang: "text", rows: 4 },
    ],
    options: [
      { id: "timeout", label: "Time limit", type: "select", choices: [["10", "10 s"], ["30", "30 s"], ["120", "2 min"], ["0", "None"]], default: "30" },
      { id: "repr", label: "Show last value", type: "toggle", default: true, hint: "Print the repr() of the final expression, like the REPL" },
    ],
    autorun: false,
    skipNodeTest: true,
    custom: () => import("./ui/E-Python"),
    async run({ inputs, opts }) {
      if (isNode) throw new ToolError("Python runs in a Web Worker (Pyodide) — open it in a browser.");
      const { pyRunner, pyMeta, tracebackLines } = await import("./lib/E-pyrunner");
      const code = inputs.code ?? "";
      if (!code.trim()) throw new ToolError("Write some Python first.");
      let r;
      try {
        r = await pyRunner().run(code, inputs.stdin ?? "", num(opts.timeout, 30) * 1000);
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      let text = r.out.map((c) => c.text).join("");
      if (r.done.repr != null && bool(opts.repr)) text += `${text && !text.endsWith("\n") ? "\n" : ""}${r.done.repr}\n`;
      if (r.done.error) text += `${text && !text.endsWith("\n") ? "\n" : ""}${r.done.error}`;
      const views: View[] = [{ label: "Console", out: { kind: "text", text: text || "(no output)", lang: "text" } }];
      if (r.done.error) {
        const lines = tracebackLines(r.done.error);
        const last = r.done.error.trim().split("\n").pop() ?? "Error";
        views.push({ label: "Error", out: { kind: "issues", items: [{ level: "error", message: last, line: lines[lines.length - 1] }] } });
      }
      const res: Result = { text, views, notes: [`Ran in ${r.done.ms < 1 ? "<1" : Math.round(r.done.ms)} ms on Python ${pyRunner().version || "3"} (Pyodide).`] };
      pyMeta.set(res, r);
      return res;
    },
    examples: [
      { label: "Basics", inputs: { code: PY_BASICS, stdin: "" }, note: "f-strings, loops and enumerate; the last expression's repr is shown like in the REPL." },
      { label: "Dataclasses", inputs: { code: PY_CLASSES, stdin: "" }, note: "@dataclass with ordering, ClassVar, default_factory, properties and operator overloading." },
      { label: "Generators", inputs: { code: PY_GEN, stdin: "" }, note: "Dict/list comprehensions, an infinite generator and lazy generator expressions." },
      { label: "Standard library", inputs: { code: PY_STDLIB, stdin: "" }, note: "json, re, statistics, collections, datetime and itertools — the whole stdlib is available offline." },
      { label: "Algorithms & timing", inputs: { code: PY_ALGO, stdin: "" }, note: "A prime sieve and memoised vs naive Fibonacci, timed with perf_counter." },
      { label: "Text with input()", inputs: { code: PY_INPUT, stdin: "3\nada 92\ngrace 87\nlinus 64" }, note: "input() reads successive lines from the stdin box, echoed like a terminal." },
      { label: "Traceback", inputs: { code: PY_ERROR, stdin: "" }, note: "A real ValueError traceback; its line numbers link back to the editor.", error: true },
    ],
    steps: ["Write Python in the editor — this is CPython compiled to WebAssembly (Pyodide).", "Press Run or Ctrl/⌘+Enter; output streams into the console; Stop restarts the interpreter.", "Lines for input() go in the stdin box, one per call."],
    tips: ["The first run downloads the runtime from this site once; after that it works offline.", "Packages cannot be installed (no network) — the full standard library is available."],
  },

  "javascript-playground": {
    inputs: [{ id: "code", label: "JavaScript", lang: "js", placeholder: "console.log('hello')" }],
    options: [
      { id: "timeout", label: "Time limit", type: "select", choices: [["2", "2 s"], ["5", "5 s"], ["30", "30 s"]], default: "5" },
      { id: "value", label: "Show result", type: "toggle", default: true, hint: "Show the value of the last expression" },
    ],
    autorun: false,
    custom: () => import("./ui/E-JsPlayground"),
    async run({ inputs, opts }) {
      const { runJs, entriesToText, jsMeta } = await import("./lib/E-jsrun");
      const code = inputs.code ?? "";
      if (!code.trim()) throw new ToolError("Write some JavaScript first.");
      let r;
      try {
        r = await runJs(code, num(opts.timeout, 5) * 1000, bool(opts.value));
      } catch (e) {
        throw new ToolError((e as Error).message);
      }
      const entries = [...r.entries];
      if (r.done.ok && r.done.value !== undefined && bool(opts.value)) entries.push({ kind: "value", text: r.done.value, depth: 0 });
      if (!r.done.ok && r.done.error) entries.push({ kind: "uncaught", text: `Uncaught ${r.done.error.stack || `${r.done.error.name}: ${r.done.error.message}`}`, line: r.done.error.line, col: r.done.error.col, depth: 0 });
      const text = entriesToText(entries);
      const views: View[] = [{ label: "Console", out: { kind: "text", text: text || "(no output)", lang: "text" } }];
      if (!r.done.ok && r.done.error) views.push({ label: "Error", out: { kind: "issues", items: [{ level: "error", message: `${r.done.error.name}: ${r.done.error.message}`, line: r.done.error.line, col: r.done.error.col }] } });
      const res: Result = { text, views, notes: [`Finished in ${r.done.ms < 1 ? "<1" : r.done.ms.toFixed(1)} ms.`] };
      jsMeta.set(res, { entries, done: r.done });
      return res;
    },
    examples: [
      { label: "Array methods", inputs: { code: JS_ARRAYS }, note: "filter / map / reduce, Object.groupBy, toSorted, at, console.table and a returned value." },
      { label: "Async & timers", inputs: { code: JS_ASYNC }, note: "Top-level await, Promise.all / race / allSettled, an async generator and console.time." },
      { label: "Classes & iterators", inputs: { code: JS_CLASSES }, note: "Private fields, static members, getters, inheritance, Symbol.iterator and generators." },
      { label: "Intl formatting", inputs: { code: JS_INTL }, note: "Numbers, currencies, dates, relative time, lists, plural rules and collation in six locales." },
      { label: "Map & Set", inputs: { code: JS_MAPSET }, note: "Counting with Map, Set algebra (union / intersection / difference), WeakMap." },
      { label: "Regex", inputs: { code: JS_REGEX }, note: "Named groups with matchAll into a table, lookbehind, replace callbacks and Unicode properties." },
      { label: "Performance", inputs: { code: JS_PERF }, note: "A tiny benchmark harness with performance.now(), console.count and console.assert." },
      { label: "Uncaught error", inputs: { code: JS_ERROR }, note: "A TypeError with its stack mapped to editor lines.", error: true },
    ],
    steps: ["Write JavaScript — it runs in an isolated Web Worker (no DOM, no access to this page).", "Press Run or Ctrl/⌘+Enter; console output, tables and the last expression appear in the console.", "Stop (or the time limit) terminates runaway code."],
    tips: ["Top-level await works: the code runs inside an async function.", "Errors link to their line in the editor."],
  },

  "go-playground-lite": liteSpec("go", "Go", [
    { label: "HTTP handler", inputs: { code: GO_HTTP }, note: "A JSON API with net/http routing patterns; gofmt aligns the struct fields and tags." },
    { label: "Goroutines & channels", inputs: { code: GO_CHAN }, note: "A worker pool with select, context cancellation and a WaitGroup; the outline lists every func." },
    { label: "Generics", inputs: { code: GO_GENERICS }, note: "Type parameters, constraints and generic methods; a library package (no main needed)." },
    { label: "Messy formatting", inputs: { code: GO_MESSY }, note: "No indentation and no spaces: re-indented with tabs, case labels outdented like gofmt." },
    { label: "Broken program", inputs: { code: GO_BROKEN }, note: "An unused import, := outside a function, a brace on its own line, an unchecked err, defer in a loop, Println with %d and an unclosed (." },
  ]),

  "rust-playground-lite": liteSpec("rust", "Rust", [
    { label: "Traits, enums & match", inputs: { code: RUST_SHAPES }, note: "An enum with struct and tuple variants, a trait with a default method, Display and lifetimes." },
    { label: "Result & errors", inputs: { code: RUST_RESULT }, note: "A custom error enum, ? propagation and map_err — no unwrap() in sight. A library, so no fn main." },
    { label: "Iterators & closures", inputs: { code: RUST_ITER }, note: "Implementing Iterator, adaptor chains (filter, take_while, partition) and BTreeMap entries." },
    { label: "Messy formatting", inputs: { code: RUST_MESSY }, note: "Re-indented with 4 spaces; spacing fixed around : = => and after commas." },
    { label: "Broken program", inputs: { code: RUST_BROKEN }, note: "A missing ;, println without !, unwrap/expect, &String, an unsafe block, todo!() and unclosed braces." },
  ]),

  "java-playground-lite": liteSpec("java", "Java", [
    { label: "Records & streams", inputs: { code: JAVA_STREAMS }, note: "Nested records and enums, a functional interface with a static factory, and stream collectors." },
    { label: "Sealed & pattern switch", inputs: { code: JAVA_SEALED }, note: "A sealed interface, record patterns, guarded cases and a compact constructor." },
    { label: "Messy formatting", inputs: { code: JAVA_MESSY }, note: "K&R braces with 4-space indent; statements under old-style case labels get an extra level." },
    { label: "Broken class", inputs: { code: JAVA_BROKEN }, note: "Raw types, == on a String, an empty catch, equals without hashCode, a wrong main signature, an unclosed ( and two public classes." },
  ]),
};

export default specs;
