/**
 * Dockerfile wizard: 11 stacks × package managers × base flavours, multi-stage
 * builds, non-root users, health checks, BuildKit cache mounts; plus a
 * matching .dockerignore, docker-compose.yml with backing services, and lint hints.
 */

export type Stack = "node" | "python" | "go" | "java" | "rust" | "dotnet" | "php" | "ruby" | "static" | "deno" | "bun";
export type Flavour = "alpine" | "slim" | "distroless" | "full";
export type Service = "postgres" | "mysql" | "redis" | "mongo" | "nginx";

export type DockerCfg = {
  stack: Stack;
  pm: string;
  version: string;
  flavour: Flavour;
  multistage: boolean;
  nonroot: boolean;
  port: string;
  healthcheck: boolean;
  healthPath: string;
  env: string;
  build: string;
  start: string;
  cache: boolean;
  services: Service[];
  name: string;
};

export const STACKS: { id: Stack; label: string; pms: [string, string][]; version: string; port: string; build: string; start: string }[] = [
  { id: "node", label: "Node.js", pms: [["npm", "npm"], ["pnpm", "pnpm"], ["yarn", "Yarn"], ["bun", "bun install"]], version: "22", port: "3000", build: "npm run build", start: "node dist/server.js" },
  { id: "python", label: "Python", pms: [["pip", "pip"], ["uv", "uv"], ["poetry", "Poetry"]], version: "3.12", port: "8000", build: "", start: "gunicorn --bind 0.0.0.0:8000 --workers 2 app:app" },
  { id: "go", label: "Go", pms: [["mod", "Go modules"]], version: "1.23", port: "8080", build: "go build -trimpath -ldflags=\"-s -w\" -o /out/app ./cmd/server", start: "/app" },
  { id: "java", label: "Java", pms: [["maven", "Maven"], ["gradle", "Gradle"]], version: "21", port: "8080", build: "", start: "java -XX:MaxRAMPercentage=75 -jar app.jar" },
  { id: "rust", label: "Rust", pms: [["cargo", "Cargo"]], version: "1.82", port: "8080", build: "cargo build --release --locked", start: "/usr/local/bin/app" },
  { id: "dotnet", label: ".NET", pms: [["dotnet", "dotnet CLI"]], version: "8.0", port: "8080", build: "dotnet publish -c Release -o /out", start: "dotnet App.dll" },
  { id: "php", label: "PHP", pms: [["composer", "Composer"], ["none", "No Composer"]], version: "8.3", port: "80", build: "", start: "apache2-foreground" },
  { id: "ruby", label: "Ruby / Rails", pms: [["bundler", "Bundler"]], version: "3.3", port: "3000", build: "bundle exec rails assets:precompile", start: "bundle exec puma -C config/puma.rb" },
  { id: "static", label: "Static site (nginx)", pms: [["npm", "npm build"], ["none", "Prebuilt files"]], version: "1.27", port: "80", build: "npm run build", start: "" },
  { id: "deno", label: "Deno", pms: [["deno", "deno"]], version: "2.1", port: "8000", build: "", start: "deno run --allow-net --allow-env --allow-read main.ts" },
  { id: "bun", label: "Bun", pms: [["bun", "bun"]], version: "1.1", port: "3000", build: "", start: "bun run src/index.ts" },
];

export const DOCKER_DEFAULT: DockerCfg = {
  stack: "node",
  pm: "npm",
  version: "22",
  flavour: "alpine",
  multistage: true,
  nonroot: true,
  port: "3000",
  healthcheck: true,
  healthPath: "/health",
  env: "NODE_ENV=production",
  build: "npm run build",
  start: "node dist/server.js",
  cache: true,
  services: ["postgres", "redis"],
  name: "web",
};

export type Issue = { level: "error" | "warning" | "info" | "ok"; message: string };

/** CMD/ENTRYPOINT exec form from a command line; null when it needs a shell. */
function execForm(cmd: string): string | null {
  if (/[|&;<>$`]|\*/.test(cmd)) return null;
  const words = cmd.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return "[" + words.map((w) => JSON.stringify(w.replace(/^(["'])(.*)\1$/, "$2"))).join(", ") + "]";
}

function runLine(cmd: string, cache: string | string[] | null, on: boolean): string {
  const mounts = on && cache ? (Array.isArray(cache) ? cache : [cache]).map((t) => `--mount=type=cache,target=${t}`).join(" ") + " " : "";
  return `RUN ${mounts}${cmd}`;
}

function envLines(env: string): [string, string][] {
  return env
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim().replace(/^export\s+/, ""), l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, "$2")] as [string, string];
    });
}

const envBlock = (pairs: [string, string][]) => (pairs.length ? `ENV ${pairs.map(([k, v]) => `${k}=${/[\s"$]/.test(v) ? JSON.stringify(v) : v}`).join(" \\\n    ")}` : "");

/* ── base images ────────────────────────────────────────────────────── */

function images(c: DockerCfg): { build: string; runtime: string; user: string; addUser: string | null; notes: string[] } {
  const v = c.version.trim() || STACKS.find((s) => s.id === c.stack)!.version;
  const f = c.flavour;
  const notes: string[] = [];
  const alpineUser = "RUN addgroup -S app && adduser -S -G app -H app";
  const debianUser = "RUN groupadd --system app && useradd --system --gid app --no-create-home app";
  const plain = f === "alpine" ? alpineUser : debianUser;
  switch (c.stack) {
    case "node": {
      const build = `node:${v}-${f === "alpine" ? "alpine" : "bookworm-slim"}`;
      if (f === "distroless") return { build, runtime: `gcr.io/distroless/nodejs${v.split(".")[0]}-debian12${c.nonroot ? ":nonroot" : ""}`, user: "nonroot", addUser: null, notes };
      return { build, runtime: f === "full" ? `node:${v}` : build, user: "node", addUser: null, notes };
    }
    case "python": {
      const build = `python:${v}-${f === "alpine" ? "alpine" : "slim"}`;
      if (f === "distroless") {
        notes.push("distroless/python3-debian12 ships Debian's Python 3.11 — build with python:3.11-slim so compiled wheels match.");
        return { build: "python:3.11-slim", runtime: `gcr.io/distroless/python3-debian12${c.nonroot ? ":nonroot" : ""}`, user: "nonroot", addUser: null, notes };
      }
      return { build, runtime: f === "full" ? `python:${v}` : build, user: "app", addUser: plain, notes };
    }
    case "go": {
      const build = `golang:${v}-${f === "alpine" ? "alpine" : "bookworm"}`;
      const runtime = f === "distroless" ? `gcr.io/distroless/static-debian12${c.nonroot ? ":nonroot" : ""}` : f === "alpine" ? "alpine:3.20" : f === "slim" ? "debian:bookworm-slim" : `golang:${v}`;
      return { build, runtime, user: f === "distroless" ? "nonroot" : "app", addUser: f === "distroless" ? null : plain, notes };
    }
    case "java": {
      const build = c.pm === "gradle" ? `gradle:8.10-jdk${v}` : `maven:3.9-eclipse-temurin-${v}`;
      const runtime = f === "distroless" ? `gcr.io/distroless/java${v}-debian12${c.nonroot ? ":nonroot" : ""}` : f === "alpine" ? `eclipse-temurin:${v}-jre-alpine` : f === "slim" ? `eclipse-temurin:${v}-jre` : `eclipse-temurin:${v}-jdk`;
      return { build, runtime, user: f === "distroless" ? "nonroot" : "app", addUser: f === "distroless" ? null : plain, notes };
    }
    case "rust": {
      const build = `rust:${v}-${f === "alpine" ? "alpine" : "slim-bookworm"}`;
      if (f === "alpine") notes.push("rust:alpine links against musl: the binary is static, but add `RUN apk add musl-dev` for crates with C code.");
      const runtime = f === "distroless" ? `gcr.io/distroless/cc-debian12${c.nonroot ? ":nonroot" : ""}` : f === "alpine" ? "alpine:3.20" : f === "slim" ? "debian:bookworm-slim" : `rust:${v}`;
      return { build, runtime, user: f === "distroless" ? "nonroot" : "app", addUser: f === "distroless" ? null : plain, notes };
    }
    case "dotnet": {
      const build = `mcr.microsoft.com/dotnet/sdk:${v}`;
      const runtime = `mcr.microsoft.com/dotnet/aspnet:${v}${f === "alpine" ? "-alpine" : f === "slim" ? "-bookworm-slim" : f === "distroless" ? "-jammy-chiseled" : ""}`;
      if (f === "distroless") notes.push("“Chiseled” Ubuntu images are Microsoft's distroless flavour: no shell, no package manager, non-root by default.");
      return { build, runtime, user: "$APP_UID", addUser: null, notes };
    }
    case "php": {
      if (f === "distroless") notes.push("There is no distroless PHP image — using the slim Apache image.");
      const runtime = f === "alpine" ? `php:${v}-fpm-alpine` : `php:${v}-apache`;
      if (f === "alpine") notes.push("php-fpm speaks FastCGI on port 9000, not HTTP — put nginx in front (tick the nginx service).");
      return { build: "composer:2", runtime, user: "www-data", addUser: null, notes };
    }
    case "ruby": {
      if (f === "distroless") notes.push("There is no official distroless Ruby image — using ruby:slim.");
      const build = `ruby:${v}-${f === "alpine" ? "alpine" : "slim"}`;
      return { build, runtime: f === "full" ? `ruby:${v}` : build, user: "app", addUser: f === "alpine" ? alpineUser : debianUser, notes };
    }
    case "static": {
      if (f === "distroless") notes.push("nginx has no distroless image — using nginx:alpine (unprivileged when non-root).");
      const runtime = c.nonroot ? `nginxinc/nginx-unprivileged:${v}-${f === "slim" || f === "full" ? "bookworm" : "alpine"}` : `nginx:${v}-${f === "slim" || f === "full" ? "bookworm" : "alpine"}`;
      return { build: "node:22-alpine", runtime, user: "nginx", addUser: null, notes };
    }
    case "deno": {
      const tag = f === "alpine" ? `alpine-${v}` : f === "slim" ? `debian-${v}` : f === "distroless" ? `distroless-${v}` : v;
      return { build: `denoland/deno:${tag}`, runtime: `denoland/deno:${tag}`, user: "deno", addUser: null, notes };
    }
    case "bun": {
      const tag = f === "alpine" ? `${v}-alpine` : f === "slim" ? `${v}-slim` : f === "distroless" ? `${v}-distroless` : v;
      return { build: `oven/bun:${f === "distroless" ? v + "-slim" : tag}`, runtime: `oven/bun:${tag}`, user: "bun", addUser: null, notes };
    }
  }
}

/* ── health checks ──────────────────────────────────────────────────── */

function health(c: DockerCfg, port: string): { line: string | null; install: string | null } {
  const url = `http://127.0.0.1:${port}${c.healthPath.startsWith("/") ? c.healthPath : "/" + c.healthPath}`;
  const opts = "--interval=30s --timeout=3s --start-period=15s --retries=3";
  if (c.flavour === "distroless" && !["node", "python", "bun", "dotnet"].includes(c.stack)) return { line: null, install: null };
  switch (c.stack) {
    case "node":
      return { line: `HEALTHCHECK ${opts} \\\n  CMD ${c.flavour === "distroless" ? "[\"/nodejs/bin/node\", \"-e\", " : "[\"node\", \"-e\", "}${JSON.stringify(`fetch('${url}').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`)}]`, install: null };
    case "bun":
      return { line: `HEALTHCHECK ${opts} \\\n  CMD ["bun", "-e", ${JSON.stringify(`const r = await fetch('${url}'); process.exit(r.ok ? 0 : 1)`)}]`, install: null };
    case "python":
      return { line: `HEALTHCHECK ${opts} \\\n  CMD ${c.flavour === "distroless" ? '["python3", "-c", ' : '["python", "-c", '}${JSON.stringify(`import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('${url}', timeout=2).status < 400 else 1)`)}]`, install: null };
    case "deno":
      return { line: `HEALTHCHECK ${opts} \\\n  CMD ["deno", "eval", ${JSON.stringify(`const r = await fetch('${url}'); Deno.exit(r.ok ? 0 : 1)`)}]`, install: null };
    case "dotnet":
      if (c.flavour === "distroless") return { line: null, install: null };
      break;
  }
  if (c.flavour === "alpine" || c.stack === "static" || (c.stack === "php" && c.flavour === "alpine")) return { line: `HEALTHCHECK ${opts} \\\n  CMD wget -qO- ${url} >/dev/null || exit 1`, install: c.stack === "dotnet" ? null : null };
  // Debian slim images have neither curl nor wget
  const needCurl = c.flavour === "slim" || c.stack === "dotnet" || c.stack === "java" || c.stack === "go" || c.stack === "rust";
  return { line: `HEALTHCHECK ${opts} \\\n  CMD curl -fsS ${url} >/dev/null || exit 1`, install: needCurl ? "RUN apt-get update && apt-get install -y --no-install-recommends curl \\\n && rm -rf /var/lib/apt/lists/*" : null };
}

/* ── Dockerfile per stack ───────────────────────────────────────────── */

export type DockerOut = { dockerfile: string; dockerignore: string; compose: string; nginx?: string; issues: Issue[] };

export function generateDocker(c: DockerCfg): DockerOut {
  const issues: Issue[] = [];
  const img = images(c);
  img.notes.forEach((n) => issues.push({ level: "info", message: n }));
  const port = (c.port || "8080").trim();
  const env = envLines(c.env);
  const hc = c.healthcheck ? health(c, c.stack === "static" && c.nonroot ? "8080" : port) : { line: null, install: null };
  const cache = c.cache;
  const ms = c.multistage || c.flavour === "distroless";
  const L: string[] = [];
  if (cache) L.push("# syntax=docker/dockerfile:1");
  const start = c.start.trim();
  const cmdOf = (cmd: string, instr = "CMD") => {
    const e = execForm(cmd);
    if (!e) issues.push({ level: "info", message: `The start command uses shell syntax, so ${instr} runs it via /bin/sh -c — signals (SIGTERM) then go to the shell, not your app. Consider an entrypoint script ending in exec.` });
    return `${instr} ${e ?? cmd}`;
  };
  const userBlock = (u: string, add: string | null) => (c.nonroot ? [...(add ? [add] : []), `USER ${u}`] : []);
  const tail = (u: string, add: string | null, extraEnv: [string, string][] = []) => {
    const out: string[] = [];
    out.push(...userBlock(u, add));
    const e = envBlock([...extraEnv.filter(([k]) => !env.some(([ek]) => ek === k)), ...env]);
    if (e) out.push(e);
    out.push(`EXPOSE ${c.stack === "static" && c.nonroot ? "8080" : port}`);
    if (hc.line) out.push(hc.line);
    return out;
  };

  switch (c.stack) {
    case "node": {
      const pm = c.pm;
      const lock = pm === "pnpm" ? "pnpm-lock.yaml" : pm === "yarn" ? "yarn.lock" : pm === "bun" ? "bun.lockb" : "package-lock.json";
      const pre = pm === "pnpm" || pm === "yarn" ? "corepack enable && " : pm === "bun" ? "npm install -g bun && " : "";
      const install = pm === "pnpm" ? "pnpm install --frozen-lockfile" : pm === "yarn" ? "yarn install --frozen-lockfile" : pm === "bun" ? "bun install --frozen-lockfile" : "npm ci";
      const installProd = pm === "pnpm" ? "pnpm install --frozen-lockfile --prod" : pm === "yarn" ? "yarn install --frozen-lockfile --production" : pm === "bun" ? "bun install --frozen-lockfile --production" : "npm ci --omit=dev";
      const cacheDir = pm === "pnpm" ? "/root/.local/share/pnpm/store" : pm === "yarn" ? "/usr/local/share/.cache/yarn" : pm === "bun" ? "/root/.bun/install/cache" : "/root/.npm";
      const build = c.build.trim();
      if (ms) {
        L.push(`ARG NODE_VERSION=${c.version || "22"}`, "", `# ── dependencies (cached until the lockfile changes)`, `FROM ${img.build.replace(`node:${c.version}`, "node:${NODE_VERSION}")} AS deps`, "WORKDIR /app", `COPY package.json ${lock} ./`, runLine(pre + install, cacheDir, cache), "");
        L.push("# ── build", "FROM deps AS build", "COPY . .");
        if (build) L.push(`RUN ${build}`);
        L.push("", "# ── production dependencies only", `FROM ${img.build.replace(`node:${c.version}`, "node:${NODE_VERSION}")} AS prod-deps`, "WORKDIR /app", `COPY package.json ${lock} ./`, runLine(pre + installProd, cacheDir, cache), "");
        L.push("# ── runtime", `FROM ${img.runtime}`, "WORKDIR /app");
        const own = c.nonroot && c.flavour !== "distroless" ? " --chown=node:node" : "";
        L.push(`COPY --from=prod-deps${own} /app/node_modules ./node_modules`);
        L.push(`COPY --from=build${own} /app/${build ? "dist" : "src"} ./${build ? "dist" : "src"}`, `COPY --from=build${own} /app/package.json ./`);
        L.push(...tail(img.user, null, [["NODE_ENV", "production"]]));
        L.push(c.flavour === "distroless" ? `CMD ${execForm(start.replace(/^node\s+/, "")) ?? JSON.stringify(start)}` : cmdOf(start));
        if (c.flavour === "distroless") issues.push({ level: "info", message: "distroless/nodejs's entrypoint is already node, so CMD holds just the script path." });
      } else {
        L.push(`FROM ${img.runtime}`, "WORKDIR /app", `COPY package.json ${lock} ./`, runLine(pre + install, cacheDir, cache), `COPY${c.nonroot ? " --chown=node:node" : ""} . .`);
        if (build) L.push(`RUN ${build}`);
        L.push(...tail(img.user, null, [["NODE_ENV", "production"]]), cmdOf(start));
        issues.push({ level: "info", message: "Single stage: devDependencies and build tools stay in the image. Turn on multi-stage for a smaller, safer image." });
      }
      break;
    }
    case "python": {
      const pm = c.pm;
      const pyEnv: [string, string][] = [["PYTHONDONTWRITEBYTECODE", "1"], ["PYTHONUNBUFFERED", "1"]];
      const alpineBuild = c.flavour === "alpine" ? ["RUN apk add --no-cache build-base libffi-dev"] : [];
      if (c.flavour === "alpine") issues.push({ level: "info", message: "Alpine uses musl: many Python wheels must compile from source there. python:slim usually builds faster and smaller in practice." });
      const venv = pm === "pip" ? "/opt/venv" : "/app/.venv";
      const installBlock =
        pm === "uv"
          ? ["COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /bin/", 'ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy', "COPY pyproject.toml uv.lock ./", runLine("uv sync --frozen --no-dev --no-install-project", "/root/.cache/uv", cache)]
          : pm === "poetry"
            ? ["ENV POETRY_VIRTUALENVS_IN_PROJECT=1 POETRY_NO_INTERACTION=1", runLine("pip install poetry==1.8.4", "/root/.cache/pip", cache), "COPY pyproject.toml poetry.lock ./", runLine("poetry install --only main --no-root", "/root/.cache/pypoetry", cache)]
            : [`RUN python -m venv ${venv}`, `ENV PATH="${venv}/bin:$PATH"`, "COPY requirements.txt .", runLine("pip install --no-cache-dir -r requirements.txt", "/root/.cache/pip", cache)];
      if (ms) {
        L.push("# ── build: resolve and install dependencies into a virtualenv", `FROM ${img.build} AS build`, "WORKDIR /app", ...alpineBuild, ...installBlock, "");
        if (c.build.trim()) L.push("COPY . .", `RUN ${c.build.trim()}`, "");
        L.push("# ── runtime", `FROM ${img.runtime}`, "WORKDIR /app");
        if (c.flavour === "distroless") {
          L.push(`COPY --from=build ${venv}/lib/python3.11/site-packages /app/site-packages`, "COPY . .", 'ENV PYTHONPATH=/app/site-packages', ...tail(img.user, null, pyEnv));
          L.push(`CMD ${execForm(start.replace(/^python3?\s+/, "")) ?? JSON.stringify(start)}`);
          issues.push({ level: "info", message: "distroless/python's entrypoint is python3: CMD holds the module/script arguments. Gunicorn-style launchers need `-m gunicorn …`." });
        } else {
          L.push(`COPY --from=build ${venv} ${venv}`, "COPY . .", ...tail(img.user, img.addUser, [...pyEnv, ["PATH", `${venv}/bin:$PATH`]]), cmdOf(start));
        }
      } else {
        L.push(`FROM ${img.runtime}`, "WORKDIR /app", ...alpineBuild, ...installBlock, "COPY . .", ...(c.build.trim() ? [`RUN ${c.build.trim()}`] : []), ...tail(img.user, img.addUser, pyEnv), cmdOf(start));
      }
      break;
    }
    case "go": {
      const build = c.build.trim() || 'go build -trimpath -ldflags="-s -w" -o /out/app .';
      const out = /-o\s+(\S+)/.exec(build)?.[1] ?? "/out/app";
      const compile = [`FROM ${img.build}${ms ? " AS build" : ""}`, "WORKDIR /src", "COPY go.mod go.sum ./", runLine("go mod download", "/go/pkg/mod", cache), "COPY . .", runLine(`CGO_ENABLED=0 GOOS=linux ${build}`, ["/go/pkg/mod", "/root/.cache/go-build"], cache)];
      if (!ms) {
        L.push(...compile, ...tail(img.user, img.addUser), `ENTRYPOINT ["${out}"]`);
        issues.push({ level: "warning", message: "Single-stage Go images carry the whole toolchain (~800 MB). Multi-stage ships just the binary (~10 MB)." });
      } else {
        L.push("# ── build a static binary", ...compile, "", "# ── runtime: just the binary", `FROM ${img.runtime}`);
        if (c.flavour === "alpine" || c.flavour === "slim") L.push(c.flavour === "alpine" ? "RUN apk add --no-cache ca-certificates tzdata" : "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl \\\n && rm -rf /var/lib/apt/lists/*");
        else if (hc.install) L.push(hc.install);
        L.push(`COPY --from=build ${out} /app`, ...tail(img.user, img.addUser), 'ENTRYPOINT ["/app"]');
      }
      break;
    }
    case "java": {
      const gradle = c.pm === "gradle";
      const jar = gradle ? "/src/build/libs/*.jar" : "/src/target/*.jar";
      L.push("# ── build the jar", `FROM ${img.build} AS build`, "WORKDIR /src");
      if (gradle) L.push("COPY build.gradle* settings.gradle* gradle.properties* ./", runLine("gradle dependencies --no-daemon -q || true", "/home/gradle/.gradle", cache), "COPY src ./src", runLine(c.build.trim() || "gradle bootJar -x test --no-daemon", "/home/gradle/.gradle", cache));
      else L.push("COPY pom.xml .", runLine("mvn -B -q dependency:go-offline", "/root/.m2", cache), "COPY src ./src", runLine(c.build.trim() || "mvn -B -DskipTests package", "/root/.m2", cache));
      if (!ms) {
        L.push(...tail(img.user, img.addUser), `RUN cp ${jar} /src/app.jar`, cmdOf(start));
        issues.push({ level: "warning", message: "Single stage keeps Maven/Gradle and the JDK in the image; multi-stage ships a JRE only." });
      } else {
        L.push("", "# ── runtime: JRE only", `FROM ${img.runtime}`, "WORKDIR /app");
        if (hc.install) L.push(hc.install);
        L.push(`COPY --from=build ${jar} app.jar`, ...tail(img.user, img.addUser));
        L.push(c.flavour === "distroless" ? `CMD ${execForm(start.replace(/^java\s+/, "")) ?? '["-jar", "app.jar"]'}` : `ENTRYPOINT ${execForm(start) ?? '["java", "-jar", "app.jar"]'}`);
        issues.push({ level: "ok", message: "-XX:MaxRAMPercentage lets the JVM size its heap from the container memory limit." });
      }
      break;
    }
    case "rust": {
      const bin = (c.name || "app").replace(/[^\w-]/g, "");
      L.push("# ── build", `FROM ${img.build} AS build`, "WORKDIR /src");
      if (c.flavour === "alpine") L.push("RUN apk add --no-cache musl-dev");
      L.push("COPY . .", runLine(`${c.build.trim() || "cargo build --release --locked"} \\\n && cp target/release/${bin} /usr/local/bin/app`, ["/usr/local/cargo/registry", "/src/target"], cache));
      if (cache) issues.push({ level: "info", message: "target/ is a cache mount, so the binary is copied out of it in the same RUN step." });
      if (!ms) {
        L.push(...tail(img.user, img.addUser), `CMD ["/usr/local/bin/app"]`);
        issues.push({ level: "warning", message: "Single-stage Rust images are 1 GB+; multi-stage ships the binary alone." });
      } else {
        L.push("", "# ── runtime", `FROM ${img.runtime}`);
        if (c.flavour === "slim") L.push("RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \\\n && rm -rf /var/lib/apt/lists/*");
        if (hc.install && c.flavour !== "slim") L.push(hc.install);
        L.push("COPY --from=build /usr/local/bin/app /usr/local/bin/app", ...tail(img.user, img.addUser), 'ENTRYPOINT ["/usr/local/bin/app"]');
      }
      issues.push({ level: "info", message: `The binary name is taken from the service name (“${bin}”) — it must match [[bin]] / the package name in Cargo.toml.` });
      break;
    }
    case "dotnet": {
      L.push("# ── build", `FROM ${img.build} AS build`, "WORKDIR /src", "COPY *.csproj ./", runLine("dotnet restore", "/root/.nuget/packages", cache), "COPY . .", runLine(`${c.build.trim() || "dotnet publish -c Release -o /out"} --no-restore`, "/root/.nuget/packages", cache), "");
      if (!ms) issues.push({ level: "info", message: ".NET always builds in the SDK image; the runtime stage uses the much smaller ASP.NET image." });
      L.push("# ── runtime", `FROM ${img.runtime}`, "WORKDIR /app");
      if (hc.install) L.push(hc.install);
      L.push("COPY --from=build /out .", ...tail(img.user, null, [["ASPNETCORE_HTTP_PORTS", port]]), `ENTRYPOINT ${execForm(start) ?? '["dotnet", "App.dll"]'}`);
      if (c.nonroot) issues.push({ level: "ok", message: ".NET 8+ images define a non-root `app` user; USER $APP_UID switches to it." });
      if (+port < 1024 && c.nonroot) issues.push({ level: "warning", message: "Non-root .NET cannot bind ports below 1024 — use 8080 (the .NET 8 default)." });
      break;
    }
    case "php": {
      const composer = c.pm === "composer";
      const apache = c.flavour !== "alpine";
      if (composer) L.push("# ── PHP dependencies", "FROM composer:2 AS vendor", "WORKDIR /app", "COPY composer.json composer.lock ./", runLine("composer install --no-dev --no-scripts --prefer-dist --no-interaction --optimize-autoloader", "/tmp/cache", cache), "");
      L.push("# ── runtime", `FROM ${img.runtime}`, "RUN docker-php-ext-install pdo_mysql opcache", `WORKDIR /var/www/html`);
      if (composer) L.push("COPY --from=vendor /app/vendor ./vendor");
      L.push("COPY . .");
      let p = port;
      if (apache && c.nonroot) {
        p = port === "80" ? "8080" : port;
        L.push(`RUN sed -i 's/Listen 80/Listen ${p}/' /etc/apache2/ports.conf \\\n && sed -i 's/:80>/:${p}>/' /etc/apache2/sites-available/000-default.conf \\\n && chown -R www-data:www-data /var/www/html`);
        if (port === "80") issues.push({ level: "info", message: "Apache moved to port 8080 so it can start as www-data (non-root users cannot bind port 80)." });
      }
      if (c.nonroot) L.push("USER www-data");
      const e = envBlock(env);
      if (e) L.push(e);
      L.push(`EXPOSE ${apache ? p : "9000"}`);
      if (hc.line && apache) L.push(hc.line.replace(`:${port}`, `:${p}`));
      L.push(apache ? 'CMD ["apache2-foreground"]' : 'CMD ["php-fpm"]');
      break;
    }
    case "ruby": {
      const alpine = c.flavour === "alpine";
      const buildPkgs = alpine ? "RUN apk add --no-cache build-base postgresql-dev tzdata git" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev git \\\n && rm -rf /var/lib/apt/lists/*";
      const runPkgs = alpine ? "RUN apk add --no-cache postgresql-libs tzdata" : "RUN apt-get update && apt-get install -y --no-install-recommends libpq5 curl \\\n && rm -rf /var/lib/apt/lists/*";
      const benv: [string, string][] = [["BUNDLE_DEPLOYMENT", "1"], ["BUNDLE_WITHOUT", "development:test"], ["BUNDLE_PATH", "/usr/local/bundle"]];
      L.push(...(ms ? ["# ── build gems and assets"] : []), `FROM ${img.build}${ms ? " AS build" : ""}`, buildPkgs, "WORKDIR /app", envBlock(benv), "COPY Gemfile Gemfile.lock ./", 'RUN bundle install && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache', "COPY . .");
      if (c.build.trim()) L.push(`RUN SECRET_KEY_BASE_DUMMY=1 ${c.build.trim()}`);
      if (ms) {
        L.push("", "# ── runtime", `FROM ${img.runtime}`, runPkgs);
        if (c.nonroot) L.push(img.addUser!); // the user must exist before COPY --chown
        L.push("WORKDIR /app", envBlock(benv), "COPY --from=build /usr/local/bundle /usr/local/bundle", `COPY --from=build${c.nonroot ? " --chown=app:app" : ""} /app /app`, ...tail(img.user, null, [["RAILS_ENV", "production"]]));
      } else L.push(...tail(img.user, img.addUser, [["RAILS_ENV", "production"]]));
      L.push(cmdOf(start));
      break;
    }
    case "static": {
      const prebuilt = c.pm === "none";
      if (!prebuilt) {
        L.push("# ── build the site", `FROM ${img.build} AS build`, "WORKDIR /app", "COPY package.json package-lock.json ./", runLine("npm ci", "/root/.npm", cache), "COPY . .", `RUN ${c.build.trim() || "npm run build"}`, "");
      }
      L.push("# ── serve with nginx", `FROM ${img.runtime}`, "COPY nginx.conf /etc/nginx/conf.d/default.conf", prebuilt ? "COPY dist/ /usr/share/nginx/html/" : "COPY --from=build /app/dist /usr/share/nginx/html");
      const e = envBlock(env);
      if (e) L.push(e);
      L.push(`EXPOSE ${c.nonroot ? "8080" : port}`);
      if (hc.line) L.push(hc.line);
      if (c.nonroot) issues.push({ level: "ok", message: "nginx-unprivileged runs as uid 101 and listens on 8080." });
      issues.push({ level: "info", message: "Output directory assumed to be dist/ (Vite). Change it to build/ (CRA), out/ (Next export) or public/ (Hugo)." });
      break;
    }
    case "deno": {
      L.push(`FROM ${img.runtime}`, "WORKDIR /app", "COPY deno.json* deno.lock* ./", "COPY . .");
      const entry = /(\S+\.(?:ts|js|tsx|mjs))\b/.exec(start)?.[1] ?? "main.ts";
      L.push(runLine(`deno cache ${entry}`, null, false));
      L.push(...tail(img.user, null), cmdOf(start));
      if (c.multistage) issues.push({ level: "info", message: "Deno needs no build stage here — dependencies are cached into the image with `deno cache`. Use `deno compile` in a build stage for a single binary." });
      break;
    }
    case "bun": {
      if (ms) {
        L.push("# ── production dependencies", `FROM ${img.build} AS deps`, "WORKDIR /app", "COPY package.json bun.lockb ./", runLine("bun install --frozen-lockfile --production", "/root/.bun/install/cache", cache), "");
        L.push("# ── runtime", `FROM ${img.runtime}`, "WORKDIR /app", "COPY --from=deps /app/node_modules ./node_modules", "COPY . .");
      } else L.push(`FROM ${img.runtime}`, "WORKDIR /app", "COPY package.json bun.lockb ./", runLine("bun install --frozen-lockfile --production", "/root/.bun/install/cache", cache), "COPY . .");
      if (c.build.trim()) L.push(`RUN ${c.build.trim()}`);
      L.push(...tail(img.user, null, [["NODE_ENV", "production"]]), cmdOf(start));
      break;
    }
  }

  const dockerfile = L.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n") + "\n";

  /* ── lint ─────────────────────────────────────────────────────────── */
  if (!c.nonroot) issues.push({ level: "warning", message: "The container runs as root. A compromised process then owns the whole container — turn on Non-root user." });
  else issues.push({ level: "ok", message: "Runs as a non-root user." });
  if (!c.healthcheck) issues.push({ level: "info", message: "No HEALTHCHECK: Docker and Compose cannot tell a hung app from a healthy one (Kubernetes ignores HEALTHCHECK — use probes there)." });
  else if (!hc.line) issues.push({ level: "info", message: "Distroless images have no shell or curl, so no HEALTHCHECK was added — use orchestrator probes (Kubernetes liveness/readiness) instead." });
  if (/^(latest)?$/i.test(c.version.trim())) issues.push({ level: "warning", message: "Pin a base-image version — “latest” changes under you and breaks reproducible builds." });
  else issues.push({ level: "ok", message: "Base images are pinned to a version." });
  const secretEnv = env.filter(([k]) => /SECRET|PASSWORD|PASSWD|TOKEN|API_KEY|PRIVATE/i.test(k));
  if (secretEnv.length) issues.push({ level: "warning", message: `${secretEnv.map(([k]) => k).join(", ")} baked into the image with ENV — anyone with the image can read it (docker history). Pass secrets at runtime (-e / env_file) or use RUN --mount=type=secret for build-time secrets.` });
  if (c.nonroot && +port > 0 && +port < 1024 && !["static", "php"].includes(c.stack)) issues.push({ level: "warning", message: `Non-root processes cannot bind port ${port} (<1024). Use a high port such as 8080 and map it: -p 80:8080.` });
  if (cache) issues.push({ level: "info", message: "RUN --mount=type=cache needs BuildKit (default since Docker 23; `DOCKER_BUILDKIT=1` on older versions)." });
  issues.push({ level: "ok", message: "Dependency manifests are copied before the source, so the install layer is cached until they change." });
  if (c.flavour === "full") issues.push({ level: "info", message: "The full base image is several hundred MB larger than slim/alpine; use it only when you need its extra tools." });

  return { dockerfile, dockerignore: dockerignore(c), compose: compose(c, env, port), nginx: c.stack === "static" || c.services.includes("nginx") ? nginxConf(c) : undefined, issues };
}

function dockerignore(c: DockerCfg): string {
  const common = ["# Version control & editors", ".git", ".gitignore", ".vscode", ".idea", "*.swp", ".DS_Store", "", "# Docker files themselves", "Dockerfile*", "docker-compose*.yml", "compose*.yaml", ".dockerignore", "", "# Secrets & local config", ".env", ".env.*", "!.env.example", "*.pem", "*.key", "", "# Logs & test output", "*.log", "coverage/", "tmp/"];
  const per: Record<Stack, string[]> = {
    node: ["node_modules/", "dist/", ".next/", ".turbo/", ".cache/", "npm-debug.log*", "yarn-error.log*"],
    bun: ["node_modules/", "dist/"],
    deno: ["node_modules/", ".deno/"],
    static: ["node_modules/", "dist/", "build/", ".cache/"],
    python: ["__pycache__/", "*.py[cod]", ".venv/", "venv/", ".pytest_cache/", ".mypy_cache/", ".ruff_cache/", "*.egg-info/", "dist/", "build/"],
    go: ["bin/", "*.test", "*.out", "vendor/"],
    java: ["target/", "build/", ".gradle/", "*.class", "out/"],
    rust: ["target/", "**/*.rs.bk"],
    dotnet: ["bin/", "obj/", "*.user", "*.suo", "TestResults/"],
    php: ["vendor/", "node_modules/", "storage/logs/", "storage/framework/cache/", ".phpunit.result.cache"],
    ruby: ["log/*", "tmp/*", "storage/*", "public/assets", "node_modules/", ".bundle/", "vendor/bundle"],
  };
  return [...common, "", `# ${STACKS.find((s) => s.id === c.stack)!.label}`, ...per[c.stack]].join("\n") + "\n";
}

const SERVICE_ENV: Record<string, [string, string]> = {
  postgres: ["DATABASE_URL", "postgres://app:app@postgres:5432/app"],
  mysql: ["DATABASE_URL", "mysql://app:app@mysql:3306/app"],
  redis: ["REDIS_URL", "redis://redis:6379/0"],
  mongo: ["MONGO_URL", "mongodb://root:example@mongo:27017/app?authSource=admin"],
};

function compose(c: DockerCfg, env: [string, string][], port: string): string {
  const name = (c.name || "app").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const inner = c.stack === "static" && c.nonroot ? "8080" : c.stack === "php" && c.nonroot && port === "80" ? "8080" : c.stack === "php" && c.flavour === "alpine" ? "9000" : port;
  const L: string[] = ["services:", `  ${name}:`, "    build: .", `    image: ${name}:dev`];
  if (!c.services.includes("nginx")) L.push("    ports:", `      - "${port === "80" ? "8080" : port}:${inner}"`);
  else L.push("    expose:", `      - "${inner}"`);
  const envs: [string, string][] = [...env.filter(([k]) => !Object.values(SERVICE_ENV).some(([sk]) => sk === k))];
  for (const s of c.services) if (SERVICE_ENV[s] && !envs.some(([k]) => k === SERVICE_ENV[s][0])) envs.push(SERVICE_ENV[s]);
  if (envs.length) L.push("    environment:", ...envs.map(([k, v]) => `      ${k}: ${/^[\w./:@?=-]+$/.test(v) && !/^\d+$/.test(v) ? v : JSON.stringify(v)}`));
  const deps = c.services.filter((s) => s !== "nginx");
  if (deps.length) L.push("    depends_on:", ...deps.flatMap((d) => [`      ${d}:`, "        condition: service_healthy"]));
  L.push("    restart: unless-stopped");
  const vols: string[] = [];
  for (const s of c.services) {
    L.push("");
    if (s === "postgres") {
      L.push("  postgres:", "    image: postgres:17-alpine", "    environment:", "      POSTGRES_USER: app", "      POSTGRES_PASSWORD: app", "      POSTGRES_DB: app", "    volumes:", "      - pgdata:/var/lib/postgresql/data", "    healthcheck:", '      test: ["CMD-SHELL", "pg_isready -U app -d app"]', "      interval: 5s", "      timeout: 3s", "      retries: 10", "    restart: unless-stopped");
      vols.push("pgdata");
    }
    if (s === "mysql") {
      L.push("  mysql:", "    image: mysql:8.4", "    environment:", "      MYSQL_DATABASE: app", "      MYSQL_USER: app", "      MYSQL_PASSWORD: app", "      MYSQL_ROOT_PASSWORD: root", "    volumes:", "      - mysqldata:/var/lib/mysql", "    healthcheck:", '      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -uroot -p$$MYSQL_ROOT_PASSWORD --silent"]', "      interval: 5s", "      timeout: 3s", "      retries: 20", "    restart: unless-stopped");
      vols.push("mysqldata");
    }
    if (s === "redis") {
      L.push("  redis:", "    image: redis:7-alpine", "    command: redis-server --appendonly yes", "    volumes:", "      - redisdata:/data", "    healthcheck:", '      test: ["CMD", "redis-cli", "ping"]', "      interval: 5s", "      timeout: 3s", "      retries: 10", "    restart: unless-stopped");
      vols.push("redisdata");
    }
    if (s === "mongo") {
      L.push("  mongo:", "    image: mongo:7", "    environment:", "      MONGO_INITDB_ROOT_USERNAME: root", "      MONGO_INITDB_ROOT_PASSWORD: example", "    volumes:", "      - mongodata:/data/db", "    healthcheck:", `      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]`, "      interval: 10s", "      timeout: 5s", "      retries: 10", "    restart: unless-stopped");
      vols.push("mongodata");
    }
    if (s === "nginx") {
      L.push("  nginx:", "    image: nginx:1.27-alpine", "    ports:", '      - "80:80"', "    volumes:", "      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro", "    depends_on:", `      - ${name}`, "    restart: unless-stopped");
    }
  }
  if (vols.length) L.push("", "volumes:", ...vols.map((v) => `  ${v}:`));
  return L.join("\n") + "\n";
}

function nginxConf(c: DockerCfg): string {
  if (c.stack === "static") {
    const listen = c.nonroot ? "8080" : c.port || "80";
    return `server {
    listen ${listen};
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # single-page app: unknown paths fall back to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # fingerprinted assets can be cached for a year
    location ~* \\.(?:js|css|woff2?|svg|png|jpg|webp|avif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /health { return 200 "ok"; add_header Content-Type text/plain; }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
}
`;
  }
  const name = (c.name || "app").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const php = c.stack === "php" && c.flavour === "alpine";
  return `server {
    listen 80;
    server_name _;
    client_max_body_size 20m;

    location / {
${php ? `        root /var/www/html/public;
        try_files $uri /index.php$is_args$args;
    }

    location ~ \\.php$ {
        root /var/www/html/public;
        fastcgi_pass ${name}:9000;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;` : `        proxy_pass http://${name}:${c.stack === "php" && c.nonroot && c.port === "80" ? "8080" : c.port || "8080"};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";`}
    }
}
`;
}
