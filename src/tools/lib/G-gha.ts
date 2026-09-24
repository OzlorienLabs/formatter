/**
 * GitHub Actions workflow explainer: triggers, permissions, jobs, steps in
 * plain English, matrix expansion (include/exclude semantics), a job graph in
 * Mermaid, and a security/maintenance lint.
 */

type Obj = Record<string, unknown>;
export type Issue = { level: "error" | "warning" | "info" | "ok"; message: string; line?: number };

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const s = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);
const code = (t: string) => `<code>${esc(t)}</code>`;

/* ── triggers ───────────────────────────────────────────────────────── */

export type Trigger = { event: string; text: string; details: [string, string][] };

const EVENT_TEXT: Record<string, string> = {
  push: "a push",
  pull_request: "a pull request",
  pull_request_target: "a pull request, running in the context of the BASE repository (with secrets)",
  workflow_dispatch: "a manual run from the Actions tab, the API or `gh workflow run`",
  workflow_call: "being called from another workflow (a reusable workflow)",
  schedule: "a schedule",
  release: "a release event",
  issues: "issue activity",
  issue_comment: "a comment on an issue or pull request",
  pull_request_review: "a pull-request review",
  pull_request_review_comment: "a comment on a pull-request diff",
  workflow_run: "another workflow's run",
  repository_dispatch: "a repository_dispatch API call",
  merge_group: "a merge-queue group",
  create: "a branch or tag being created",
  delete: "a branch or tag being deleted",
  deployment: "a deployment being created",
  deployment_status: "a deployment status change",
  page_build: "a GitHub Pages build",
  registry_package: "a package being published",
  check_run: "check-run activity",
  check_suite: "check-suite activity",
  discussion: "discussion activity",
  fork: "the repository being forked",
  watch: "someone starring the repository",
  label: "label activity",
  milestone: "milestone activity",
  status: "a commit status change",
};

function filters(cfg: Obj): [string, string][] {
  const d: [string, string][] = [];
  const f = (k: string, label: string) => {
    if (cfg[k] !== undefined) d.push([label, arr(cfg[k]).map(s).join(", ")]);
  };
  f("types", "activity types");
  f("branches", "branches");
  f("branches-ignore", "except branches");
  f("tags", "tags");
  f("tags-ignore", "except tags");
  f("paths", "only when files change under");
  f("paths-ignore", "ignoring changes to");
  f("workflows", "after workflows");
  return d;
}

export async function explainTriggers(on: unknown): Promise<Trigger[]> {
  const out: Trigger[] = [];
  const entries: [string, unknown][] = typeof on === "string" ? [[on, null]] : Array.isArray(on) ? on.map((e) => [s(e), null]) : isObj(on) ? Object.entries(on) : [];
  let cronstrue: { toString: (c: string, o?: object) => string } | null = null;
  for (const [ev, cfg] of entries) {
    const base = EVENT_TEXT[ev] ?? `the ${ev} event`;
    const t: Trigger = { event: ev, text: `Runs on ${base}`, details: [] };
    if (isObj(cfg)) t.details.push(...filters(cfg));
    if (ev === "schedule") {
      cronstrue ??= (await import("cronstrue")).default as never;
      const crons = arr(cfg).map((c) => s(isObj(c) ? c.cron : c));
      t.details = crons.map((c) => {
        let desc = "";
        try {
          desc = cronstrue!.toString(c, { use24HourTimeFormat: true, verbose: false });
        } catch {
          desc = "invalid cron";
        }
        return [c, `${desc} (UTC)`];
      });
      t.text = `Runs on a schedule (${crons.length} cron${crons.length > 1 ? "s" : ""}, UTC, may be delayed under load)`;
    }
    if ((ev === "workflow_dispatch" || ev === "workflow_call") && isObj(cfg) && isObj(cfg.inputs)) {
      for (const [name, def] of Object.entries(cfg.inputs)) {
        const d = isObj(def) ? def : {};
        t.details.push([`input ${name}`, `${s(d.type || "string")}${d.required ? ", required" : ""}${d.default !== undefined ? `, default ${s(d.default)}` : ""}${d.options ? ` — one of ${arr(d.options).map(s).join(" / ")}` : ""}${d.description ? ` — ${s(d.description)}` : ""}`]);
      }
    }
    if (ev === "workflow_call" && isObj(cfg) && isObj(cfg.secrets)) for (const [name, def] of Object.entries(cfg.secrets)) t.details.push([`secret ${name}`, isObj(def) && def.required ? "required" : "optional"]);
    if (ev === "push" && isObj(cfg) && cfg.tags && !cfg.branches) t.text = "Runs when matching tags are pushed (not on branch pushes)";
    out.push(t);
  }
  return out;
}

/* ── actions ────────────────────────────────────────────────────────── */

function withs(step: Obj): Obj {
  return isObj(step.with) ? step.with : {};
}

export function explainUses(uses: string, w: Obj): string {
  const [ref, version = ""] = uses.split("@");
  const name = ref.toLowerCase();
  const v = (k: string) => s(w[k]);
  if (uses.startsWith("./")) return `Runs the local action in ${code(ref)}`;
  if (uses.startsWith("docker://")) return `Runs the container image ${code(uses.slice(9))} as a step`;
  const known: [RegExp, () => string][] = [
    [/^actions\/checkout$/, () => `Checks out the repository${v("ref") ? ` at ${code(v("ref"))}` : ""}${v("fetch-depth") === "0" ? " with full history (all branches and tags)" : v("fetch-depth") ? ` (last ${v("fetch-depth")} commits)` : " (shallow: the triggering commit only)"}${v("submodules") ? `, including submodules (${v("submodules")})` : ""}${v("repository") ? ` from ${code(v("repository"))}` : ""}`],
    [/^actions\/setup-node$/, () => `Installs Node.js ${code(v("node-version") || v("node-version-file") || "(version from .nvmrc?)")}${v("cache") ? ` and caches the ${v("cache")} store` : ""}${v("registry-url") ? `, configured for ${v("registry-url")}` : ""}`],
    [/^actions\/setup-python$/, () => `Installs Python ${code(v("python-version") || "3.x")}${v("cache") ? ` and caches ${v("cache")} downloads` : ""}`],
    [/^actions\/setup-go$/, () => `Installs Go ${code(v("go-version") || v("go-version-file") || "stable")}${v("cache") === "false" ? "" : " (module and build caches on by default)"}`],
    [/^actions\/setup-java$/, () => `Installs Java ${code(v("java-version"))} (${v("distribution") || "distribution?"})${v("cache") ? `, caching ${v("cache")} dependencies` : ""}`],
    [/^actions\/setup-dotnet$/, () => `Installs the .NET SDK ${code(v("dotnet-version"))}`],
    [/^ruby\/setup-ruby$/, () => `Installs Ruby ${code(v("ruby-version") || ".ruby-version")}${v("bundler-cache") === "true" ? " and runs bundle install with caching" : ""}`],
    [/^pnpm\/action-setup$/, () => `Installs pnpm ${code(v("version") || "(from packageManager)")}`],
    [/^oven-sh\/setup-bun$/, () => `Installs Bun ${code(v("bun-version") || "latest")}`],
    [/^denoland\/setup-deno$/, () => `Installs Deno ${code(v("deno-version") || "latest")}`],
    [/^actions\/cache(\/(save|restore))?$/, () => `${/restore/.test(name) ? "Restores" : /save/.test(name) ? "Saves" : "Restores (and later saves)"} a cache of ${code(v("path").replace(/\n/g, ", "))} keyed by ${code(v("key"))}`],
    [/^actions\/upload-artifact$/, () => `Uploads ${code(v("path").replace(/\n/g, ", ") || "files")} as the artifact ${code(v("name") || "artifact")}${v("retention-days") ? ` (kept ${v("retention-days")} days)` : ""}`],
    [/^actions\/download-artifact$/, () => `Downloads the artifact ${code(v("name") || "(all artifacts)")}${v("path") ? ` into ${code(v("path"))}` : ""}`],
    [/^actions\/github-script$/, () => `Runs inline JavaScript with an authenticated Octokit client (${code("github")}) and the event ${code("context")}`],
    [/^actions\/configure-pages$/, () => "Prepares GitHub Pages metadata"],
    [/^actions\/upload-pages-artifact$/, () => `Packages ${code(v("path") || "_site")} for GitHub Pages`],
    [/^actions\/deploy-pages$/, () => "Deploys the Pages artifact to GitHub Pages"],
    [/^actions\/labeler$/, () => "Labels pull requests by the files they change"],
    [/^actions\/stale$/, () => "Marks and closes stale issues and pull requests"],
    [/^actions\/create-release$/, () => "Creates a GitHub release (archived action — use softprops/action-gh-release or `gh release create`)"],
    [/^actions\/dependency-review-action$/, () => "Fails the PR when it adds dependencies with known vulnerabilities"],
    [/^github\/codeql-action\/init$/, () => `Initialises CodeQL for ${code(v("languages") || "detected languages")}`],
    [/^github\/codeql-action\/autobuild$/, () => "Builds the code for CodeQL analysis"],
    [/^github\/codeql-action\/analyze$/, () => "Runs CodeQL and uploads code-scanning alerts"],
    [/^github\/codeql-action\/upload-sarif$/, () => `Uploads the SARIF report ${code(v("sarif_file"))} to code scanning`],
    [/^docker\/setup-qemu-action$/, () => "Installs QEMU so Buildx can build for other CPU architectures"],
    [/^docker\/setup-buildx-action$/, () => "Sets up Docker Buildx (BuildKit builder)"],
    [/^docker\/login-action$/, () => `Logs in to ${code(v("registry") || "Docker Hub")}${v("username") ? ` as ${code(v("username"))}` : ""}`],
    [/^docker\/metadata-action$/, () => `Computes image tags and labels for ${code(v("images"))}`],
    [/^docker\/build-push-action$/, () => `Builds the Docker image${v("context") ? ` from ${code(v("context"))}` : ""}${v("platforms") ? ` for ${code(v("platforms"))}` : ""}${v("push") === "true" ? ` and pushes ${code(v("tags").replace(/\n/g, ", ") || "it")}` : " (not pushed)"}${v("cache-from") ? ", using a build cache" : ""}`],
    [/^aws-actions\/configure-aws-credentials$/, () => `Gets AWS credentials${v("role-to-assume") ? ` by assuming ${code(v("role-to-assume"))} via OIDC` : v("aws-access-key-id") ? " from access-key secrets" : ""} in ${code(v("aws-region"))}`],
    [/^aws-actions\/amazon-ecr-login$/, () => "Logs Docker in to Amazon ECR"],
    [/^aws-actions\/amazon-ecs-deploy-task-definition$/, () => `Deploys a task definition to ECS service ${code(v("service"))}`],
    [/^azure\/login$/, () => "Logs in to Azure"],
    [/^google-github-actions\/auth$/, () => "Authenticates to Google Cloud (Workload Identity Federation or a key)"],
    [/^hashicorp\/setup-terraform$/, () => `Installs Terraform ${code(v("terraform_version") || "latest")}`],
    [/^softprops\/action-gh-release$/, () => `Creates/updates a GitHub release${v("files") ? ` with ${code(v("files").replace(/\n/g, ", "))}` : ""}`],
    [/^codecov\/codecov-action$/, () => "Uploads coverage reports to Codecov"],
    [/^peaceiris\/actions-gh-pages$/, () => `Pushes ${code(v("publish_dir"))} to the gh-pages branch`],
    [/^jamesives\/github-pages-deploy-action$/, () => `Deploys ${code(v("folder"))} to ${code(v("branch") || "gh-pages")}`],
    [/^gradle\/actions\/setup-gradle$/, () => "Sets up Gradle with dependency caching"],
    [/^dorny\/paths-filter$/, () => "Detects which paths changed so later steps/jobs can be skipped"],
    [/^slackapi\/slack-github-action$/, () => "Posts a message to Slack"],
    [/^golangci\/golangci-lint-action$/, () => "Runs golangci-lint"],
  ];
  for (const [re, f] of known) if (re.test(name)) return f() + (version ? "" : "");
  return `Uses the action ${code(ref)}${version ? ` at ${code(version)}` : ""}`;
}

function explainRun(run: string, shell?: string): string {
  const lines = run.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const first = lines[0] ?? "";
  const guesses: [RegExp, string][] = [
    [/^(npm ci|npm install|pnpm install|yarn( install)?|bun install)\b/, "installs dependencies"],
    [/\b(npm|pnpm|yarn|bun) (run )?test\b|\bjest\b|\bvitest\b/, "runs the tests"],
    [/\b(npm|pnpm|yarn|bun) run lint\b|\beslint\b|\bruff\b|\bflake8\b|golangci-lint/, "lints the code"],
    [/\b(npm|pnpm|yarn|bun) run build\b|\bmake\b|\bcargo build\b|\bgo build\b|\bmvn\b.*package|gradle.*build/, "builds the project"],
    [/\bpytest\b|\bgo test\b|\bcargo test\b|\bmvn\b.*test|\bdotnet test\b|\brspec\b/, "runs the tests"],
    [/\bdocker (build|buildx)\b/, "builds a Docker image"],
    [/\bdocker push\b/, "pushes a Docker image"],
    [/\bpip install\b|\bpoetry install\b|\buv sync\b/, "installs Python dependencies"],
    [/\bterraform (plan|apply)\b/, "runs Terraform"],
    [/\bkubectl\b|\bhelm (upgrade|install)\b/, "deploys to Kubernetes"],
    [/\bgh (release|pr|issue)\b/, "calls the GitHub CLI"],
    [/\baws\b/, "calls the AWS CLI"],
    [/\bnpm publish\b/, "publishes to npm"],
    [/>>\s*"?\$GITHUB_OUTPUT/, "sets step outputs"],
    [/>>\s*"?\$GITHUB_ENV/, "exports environment variables to later steps"],
  ];
  const what = [...new Set(guesses.filter(([re]) => re.test(run)).map(([, t]) => t))];
  return `Runs ${lines.length > 1 ? `a ${lines.length}-line ${shell ?? "shell"} script` : `${code(first.length > 90 ? first.slice(0, 87) + "…" : first)}`}${what.length ? ` — ${list(what)}` : ""}`;
}

/* ── matrix ─────────────────────────────────────────────────────────── */

export function expandMatrix(matrix: unknown): { combos: Obj[]; keys: string[]; note?: string } {
  if (typeof matrix === "string") return { combos: [], keys: [], note: `The matrix is computed at runtime (${matrix}) and cannot be expanded here.` };
  if (!isObj(matrix)) return { combos: [], keys: [] };
  const keys = Object.keys(matrix).filter((k) => k !== "include" && k !== "exclude");
  for (const k of keys) if (typeof matrix[k] === "string") return { combos: [], keys, note: `matrix.${k} is an expression (${matrix[k]}) evaluated at runtime.` };
  let combos: Obj[] = keys.length ? [{}] : [];
  for (const k of keys) {
    const vals = arr(matrix[k]);
    const next: Obj[] = [];
    for (const c of combos) for (const v of vals) next.push({ ...c, [k]: v });
    combos = next;
  }
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const ex of arr(matrix.exclude)) {
    if (!isObj(ex)) continue;
    combos = combos.filter((c) => !Object.entries(ex).every(([k, v]) => eq(c[k], v)));
  }
  const extraKeys = new Set<string>();
  for (const inc of arr(matrix.include)) {
    if (!isObj(inc)) continue;
    let added = false;
    for (const c of combos) {
      // an include extends a combination when it doesn't overwrite any ORIGINAL matrix value
      if (Object.entries(inc).every(([k, v]) => !keys.includes(k) || eq(c[k], v))) {
        for (const [k, v] of Object.entries(inc)) if (!keys.includes(k)) { c[k] = v; extraKeys.add(k); }
        added = true;
      }
    }
    if (!added) {
      combos.push({ ...inc });
      Object.keys(inc).forEach((k) => !keys.includes(k) && extraKeys.add(k));
    }
  }
  return { combos, keys: [...keys, ...extraKeys] };
}

/* ── analysis ───────────────────────────────────────────────────────── */

export type JobInfo = { id: string; name: string; runsOn: string; needs: string[]; if: string; timeout: string; environment: string; services: string; outputs: string; matrix: number; steps: { name: string; text: string; if?: string }[]; uses?: string };

export type Analysis = {
  name: string;
  triggers: Trigger[];
  jobs: JobInfo[];
  matrices: { job: string; keys: string[]; combos: Obj[]; note?: string }[];
  issues: Issue[];
  mermaid: string;
  summaryHtml: string;
  text: string;
};

function lineOf(src: string, re: RegExp, from = 0): number | undefined {
  const lines = src.split("\n");
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i + 1;
  return undefined;
}

const reEsc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function analyse(wf: Obj, src: string): Promise<Analysis> {
  const issues: Issue[] = [];
  const name = s(wf.name) || "(unnamed workflow)";
  const on = wf.on ?? wf.true; // YAML 1.1 parsers turn a bare `on:` key into true
  if (on === undefined) issues.push({ level: "error", message: "No `on:` section — the workflow never runs.", line: 1 });
  const triggers = await explainTriggers(on);
  const events = triggers.map((t) => t.event);
  const jobsObj = isObj(wf.jobs) ? wf.jobs : {};
  if (!Object.keys(jobsObj).length) issues.push({ level: "error", message: "No `jobs:` defined." });

  // top-level checks
  if (wf.permissions === undefined) issues.push({ level: "warning", message: "No top-level `permissions:` — the GITHUB_TOKEN gets the repository default, which may be read/write on everything. Add e.g. `permissions: { contents: read }` and widen per job.", line: lineOf(src, /^jobs:/) });
  else if (wf.permissions === "write-all") issues.push({ level: "warning", message: "`permissions: write-all` gives every job full write access — grant only the scopes each job needs.", line: lineOf(src, /^permissions:/) });
  else issues.push({ level: "ok", message: "Top-level permissions are declared." });
  if (events.includes("pull_request_target")) issues.push({ level: "info", message: "pull_request_target runs with secrets and a write token even for PRs from forks — never build or run the PR's code in it.", line: lineOf(src, /pull_request_target/) });
  if (triggers.find((t) => t.event === "schedule")?.details.some(([c]) => /^\*(\/[1-4])?\s/.test(c) || /^\*\s/.test(c))) issues.push({ level: "info", message: "GitHub runs schedules at most every 5 minutes, and delays or drops runs at busy times (especially at minute 0)." });

  const jobs: JobInfo[] = [];
  const matrices: Analysis["matrices"] = [];
  const ids = Object.keys(jobsObj);
  for (const [id, jv] of Object.entries(jobsObj)) {
    const j = isObj(jv) ? jv : {};
    const jobLine = lineOf(src, new RegExp(`^\\s{2}${reEsc(id)}:\\s*$`)) ?? lineOf(src, new RegExp(`^\\s+${reEsc(id)}:`));
    const needs = arr(j.needs).map(s);
    for (const n of needs) if (!ids.includes(n)) issues.push({ level: "error", message: `Job ${id} needs “${n}”, which is not a job in this workflow.`, line: jobLine });
    const strategy = isObj(j.strategy) ? j.strategy : {};
    const mx = strategy.matrix !== undefined ? expandMatrix(strategy.matrix) : null;
    if (mx) matrices.push({ job: id, ...mx });
    if (mx && mx.combos.length > 256) issues.push({ level: "error", message: `Job ${id}'s matrix expands to ${mx.combos.length} jobs — GitHub's limit is 256.`, line: jobLine });
    const runsOn = Array.isArray(j["runs-on"]) ? (j["runs-on"] as unknown[]).map(s).join(", ") : isObj(j["runs-on"]) ? s((j["runs-on"] as Obj).group ?? (j["runs-on"] as Obj).labels) : s(j["runs-on"]);
    if (!j.uses && !j["runs-on"]) issues.push({ level: "error", message: `Job ${id} has no runs-on.`, line: jobLine });
    if (/ubuntu-(18|20)\.04|macos-(10|11|12|13)\b|windows-2016|windows-2019/.test(runsOn)) issues.push({ level: "warning", message: `Job ${id} uses the runner image ${runsOn}, which GitHub has retired or is retiring — move to a current image (e.g. ubuntu-24.04).`, line: jobLine });
    if (j["timeout-minutes"] === undefined && !j.uses) issues.push({ level: "info", message: `Job ${id} has no timeout-minutes — a hung step can burn up to 6 hours of runner time.`, line: jobLine });
    if (j["continue-on-error"] === true) issues.push({ level: "info", message: `Job ${id} has continue-on-error: failures will not fail the workflow.`, line: jobLine });
    const env = isObj(j.environment) ? s((j.environment as Obj).name) : s(j.environment);
    const services = isObj(j.services) ? Object.entries(j.services).map(([k, v]) => `${k} (${s(isObj(v) ? v.image : v)})`).join(", ") : "";
    const outputs = isObj(j.outputs) ? Object.keys(j.outputs).join(", ") : "";
    const steps: JobInfo["steps"] = [];
    if (j.uses) {
      const u = s(j.uses);
      steps.push({ name: "Reusable workflow", text: `Calls the reusable workflow ${code(u)}${j.secrets === "inherit" ? " and passes all of this repository's secrets (secrets: inherit)" : ""}` });
      checkRef(u, id, issues, lineOf(src, new RegExp(`uses:\\s*['"]?${reEsc(u)}`)));
    }
    const stepList = arr(j.steps);
    if (!j.uses && !stepList.length) issues.push({ level: "error", message: `Job ${id} has no steps.`, line: jobLine });
    stepList.forEach((st, i) => {
      const step = isObj(st) ? st : {};
      const label = s(step.name) || (step.uses ? s(step.uses).split("@")[0] : step.run ? s(step.run).split("\n")[0].slice(0, 60) : `step ${i + 1}`);
      let text = "";
      if (step.uses) {
        const u = s(step.uses);
        text = explainUses(u, withs(step));
        const ln = lineOf(src, new RegExp(`uses:\\s*['"]?${reEsc(u)}`));
        checkRef(u, id, issues, ln);
        if (/^actions\/checkout@/.test(u) && events.includes("pull_request_target")) {
          const ref = s(withs(step).ref);
          if (/pull_request\.head\.(sha|ref)|head_ref|refs\/pull\//.test(ref)) issues.push({ level: "error", message: `Job ${id} checks out the PR's head in a pull_request_target workflow (“pwn request”): untrusted code runs with secrets and a write token. Use pull_request, or never execute the checked-out code.`, line: ln });
        }
      } else if (step.run !== undefined) {
        const run = s(step.run);
        text = explainRun(run, s(step.shell) || undefined);
        const ln = lineOf(src, new RegExp(reEsc(run.split("\n")[0].trim().slice(0, 60)))) ?? jobLine;
        const inj = run.match(/\$\{\{\s*(github\.event\.[\w.]*(title|body|message|name|email|label|ref|head_ref|default_branch|page_name)\w*|github\.head_ref)\s*\}\}/gi);
        if (inj) issues.push({ level: "error", message: `Script injection risk in job ${id}: ${[...new Set(inj)].join(", ")} is pasted into the shell script. An attacker controls that text — pass it through env: and use "$VAR" instead.`, line: ln });
        else if (/\$\{\{\s*github\.event\./.test(run)) issues.push({ level: "info", message: `Job ${id} interpolates github.event values into run: — safe for IDs and numbers, but route free text through env:.`, line: ln });
        if (/::set-output|::save-state/.test(run)) issues.push({ level: "warning", message: `Job ${id} uses the deprecated ::set-output / ::save-state commands — write to $GITHUB_OUTPUT / $GITHUB_STATE instead.`, line: ln });
        if (/::set-env|::add-path/.test(run)) issues.push({ level: "error", message: `Job ${id} uses ::set-env / ::add-path, which GitHub disabled — use $GITHUB_ENV / $GITHUB_PATH.`, line: ln });
        if (/curl[^|\n]*\|\s*(sudo\s+)?(ba)?sh/.test(run)) issues.push({ level: "info", message: `Job ${id} pipes a download straight into a shell — pin a checksum or version.`, line: ln });
      } else text = "Empty step (no uses: or run:)";
      if (step["continue-on-error"] === true) text += " — failures are ignored (continue-on-error)";
      steps.push({ name: label, text, if: step.if !== undefined ? s(step.if) : undefined });
    });
    jobs.push({ id, name: s(j.name) || id, runsOn: runsOn || (j.uses ? "(reusable workflow)" : "?"), needs, if: s(j.if), timeout: s(j["timeout-minutes"]), environment: env, services, outputs, matrix: mx?.combos.length ?? 0, steps, uses: j.uses ? s(j.uses) : undefined });
  }

  // cycles
  const state = new Map<string, number>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      issues.push({ level: "error", message: `Circular needs: ${[...path.slice(path.indexOf(id)), id].join(" → ")}.` });
      return;
    }
    state.set(id, 1);
    for (const n of jobs.find((j) => j.id === id)?.needs ?? []) if (ids.includes(n)) visit(n, [...path, id]);
    state.set(id, 2);
  };
  ids.forEach((id) => visit(id, []));

  const mermaid = toMermaid(triggers, jobs);
  const summaryHtml = toHtml(name, wf, triggers, jobs, matrices);
  const text = toText(name, wf, triggers, jobs, matrices);
  // dedupe identical issues
  const seen = new Set<string>();
  const uniq = issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true))).map(({ level, message, line }) => ({ level, message, line }));
  const order = { error: 0, warning: 1, info: 2, ok: 3 };
  uniq.sort((a, b) => order[a.level] - order[b.level] || (a.line ?? 0) - (b.line ?? 0));
  return { name, triggers, jobs, matrices, issues: uniq, mermaid, summaryHtml, text };
}

const FIRST_PARTY = /^(actions|github)\//i;
/** Large vendors publishing official actions: tag pinning is still a risk, but a smaller one. */
const VENDORS = /^(docker|aws-actions|azure|google-github-actions|hashicorp|microsoft|gradle|ruby|pnpm|oven-sh|denoland|codecov|slackapi|golangci|github-actions)\//i;
const DEPRECATED: [RegExp, string][] = [
  [/^actions\/(checkout|setup-node|setup-python|setup-java|setup-go|cache)@v[12]$/, "runs on a retired Node.js runtime"],
  [/^actions\/(upload|download)-artifact@v[123]$/, "was shut down (v3 and older stopped working in January 2025) — use v4"],
  [/^actions\/create-release@/, "is archived and unmaintained"],
  [/^actions\/setup-node@v3$|^actions\/checkout@v3$/, "uses Node 16, which GitHub has deprecated — use v4"],
];

function checkRef(uses: string, job: string, issues: Issue[], line?: number) {
  if (uses.startsWith("./") || uses.startsWith("docker://")) return;
  const [ref, version] = uses.split("@");
  if (!version) {
    issues.push({ level: "error", message: `${uses} (job ${job}) has no @ref — GitHub requires a tag, branch or SHA.`, line });
    return;
  }
  for (const [re, why] of DEPRECATED) if (re.test(uses)) issues.push({ level: "warning", message: `${uses} (job ${job}) ${why}.`, line });
  const sha = /^[0-9a-f]{40}$/.test(version);
  if (/^(main|master|dev|develop|latest|HEAD)$/.test(version)) issues.push({ level: "warning", message: `${uses} (job ${job}) follows a branch: its code can change under you at any time. Pin a release tag or, better, a commit SHA.`, line });
  else if (!sha && !FIRST_PARTY.test(ref)) {
    const vendor = VENDORS.test(ref);
    const key = `pin:${uses}`;
    const prev = issues.find((i) => (i as Issue & { key?: string }).key === key) as (Issue & { key?: string; jobs?: string[] }) | undefined;
    if (prev) {
      prev.jobs!.push(job);
      prev.message = pinMsg(uses, prev.jobs!, vendor);
    } else issues.push({ level: vendor ? "info" : "warning", message: pinMsg(uses, [job], vendor), line, key, jobs: [job] } as Issue);
  }
}

function pinMsg(uses: string, jobs: string[], vendor: boolean): string {
  return `${vendor ? "Vendor" : "Third-party"} action ${uses} (job${jobs.length > 1 ? "s" : ""} ${jobs.join(", ")}) is pinned to a movable tag — ${vendor ? "consider pinning" : "pin"} the full commit SHA (tag in a comment) so a re-pointed or compromised release cannot run in your CI.`;
}

/* ── renderers ──────────────────────────────────────────────────────── */

function toMermaid(triggers: Trigger[], jobs: JobInfo[]): string {
  const idOf = (j: string) => "j_" + j.replace(/[^\w]/g, "_");
  const lab = (t: string) => t.replace(/"/g, "'");
  const L = ["flowchart LR"];
  L.push(`  trigger(["${lab(triggers.map((t) => t.event).join(" · ") || "trigger")}"])`);
  for (const j of jobs) {
    const extra = [j.matrix ? `×${j.matrix} matrix` : "", j.environment ? `env: ${j.environment}` : "", j.uses ? "reusable" : ""].filter(Boolean).join(" · ");
    const title = j.name.includes("${{") ? j.id : j.name; // expression names are unreadable in a graph
    const runs = j.runsOn.includes("${{") ? (j.matrix ? "matrix runners" : "dynamic runner") : j.runsOn;
    L.push(`  ${idOf(j.id)}["<b>${lab(title)}</b><br/>${lab(runs)}${extra ? " · " + lab(extra) : ""}"]`);
  }
  for (const j of jobs) {
    if (!j.needs.length) L.push(`  trigger --> ${idOf(j.id)}`);
    for (const n of j.needs) if (jobs.some((x) => x.id === n)) L.push(`  ${idOf(n)} -->${j.if ? `|"if"|` : ""} ${idOf(j.id)}`);
  }
  L.push("  classDef default fill:#f5fbfd,stroke:#0088b0,color:#1f1d1c", "  style trigger fill:#fff7d6,stroke:#b98d00");
  return L.join("\n");
}

function toHtml(name: string, wf: Obj, triggers: Trigger[], jobs: JobInfo[], matrices: Analysis["matrices"]): string {
  const H: string[] = [`<h2>${esc(name)}</h2>`];
  if (wf["run-name"]) H.push(`<p>Each run is titled ${code(s(wf["run-name"]))}.</p>`);
  H.push("<h3>When it runs</h3><ul>");
  for (const t of triggers) {
    H.push(`<li><strong>${esc(t.event)}</strong> — ${esc(t.text.replace(/^Runs on /, ""))}`);
    if (t.details.length) H.push("<ul>" + t.details.map(([k, v]) => `<li>${esc(k)}: ${code(v)}</li>`).join("") + "</ul>");
    H.push("</li>");
  }
  H.push("</ul>");
  const perms = wf.permissions;
  H.push("<h3>Token permissions</h3>");
  if (perms === undefined) H.push("<p>Not declared — the repository default applies.</p>");
  else if (typeof perms === "string") H.push(`<p>${code(perms)}</p>`);
  else if (isObj(perms)) H.push(`<p>${Object.keys(perms).length ? Object.entries(perms).map(([k, v]) => `${code(k)}: ${esc(s(v))}`).join(", ") : "none (empty map: every scope off)"}</p>`);
  if (wf.concurrency) {
    const c = isObj(wf.concurrency) ? wf.concurrency : { group: wf.concurrency };
    H.push(`<h3>Concurrency</h3><p>Runs share the group ${code(s(c.group))}; ${c["cancel-in-progress"] === true || c["cancel-in-progress"] === "true" ? "a new run cancels the one in progress" : "a new run waits for the running one (queued runs beyond one are replaced)"}.</p>`);
  }
  if (isObj(wf.env)) H.push(`<h3>Environment</h3><p>${Object.entries(wf.env).map(([k, v]) => `${code(k)} = ${code(s(v))}`).join(", ")}</p>`);
  if (isObj(wf.defaults) && isObj((wf.defaults as Obj).run)) {
    const r = (wf.defaults as Obj).run as Obj;
    H.push(`<h3>Defaults</h3><p>run steps use ${r.shell ? `shell ${code(s(r.shell))}` : "the default shell"}${r["working-directory"] ? ` in ${code(s(r["working-directory"]))}` : ""}.</p>`);
  }
  H.push(`<h3>Jobs (${jobs.length})</h3>`);
  for (const j of jobs) {
    const bits = [`runs on ${code(j.runsOn)}`];
    if (j.needs.length) bits.push(`after ${j.needs.map(code).join(", ")}`);
    if (j.if) bits.push(`only if ${code(j.if)}`);
    if (j.matrix) bits.push(`${j.matrix} matrix combinations`);
    if (j.environment) bits.push(`deploys to environment ${code(j.environment)}`);
    if (j.timeout) bits.push(`times out after ${j.timeout} min`);
    if (j.services) bits.push(`with service containers ${esc(j.services)}`);
    if (j.outputs) bits.push(`outputs ${code(j.outputs)}`);
    H.push(`<h4>${esc(j.name)}${j.name !== j.id ? ` <small>(${esc(j.id)})</small>` : ""}</h4><p>${bits.join(" · ")}</p><ol>`);
    for (const st of j.steps) H.push(`<li><strong>${esc(st.name)}</strong> — ${st.text}${st.if ? ` <em>(only if ${code(st.if)})</em>` : ""}</li>`);
    H.push("</ol>");
  }
  for (const m of matrices) if (m.note) H.push(`<p><em>${esc(m.job)}: ${esc(m.note)}</em></p>`);
  return H.join("\n");
}

const strip = (h: string) => h.replace(/<code>(.*?)<\/code>/g, "`$1`").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

function toText(name: string, wf: Obj, triggers: Trigger[], jobs: JobInfo[], matrices: Analysis["matrices"]): string {
  const L: string[] = [`# ${name}`, "", "## When it runs"];
  for (const t of triggers) {
    L.push(`- ${t.text}`);
    for (const [k, v] of t.details) L.push(`    ${k}: ${v}`);
  }
  if (wf.permissions !== undefined) L.push("", `Permissions: ${typeof wf.permissions === "string" ? wf.permissions : JSON.stringify(wf.permissions)}`);
  L.push("", `## Jobs (${jobs.length})`);
  for (const j of jobs) {
    L.push("", `### ${j.name} — runs on ${j.runsOn}${j.needs.length ? `, after ${j.needs.join(", ")}` : ""}${j.if ? `, if ${j.if}` : ""}${j.matrix ? `, ${j.matrix} matrix jobs` : ""}`);
    j.steps.forEach((st, i) => L.push(`${i + 1}. ${st.name}: ${strip(st.text)}${st.if ? ` (if ${st.if})` : ""}`));
  }
  for (const m of matrices) if (m.combos.length) L.push("", `Matrix for ${m.job}: ${m.combos.length} combinations (${m.keys.join(" × ")})`);
  return L.join("\n");
}
