/**
 * tar command builder: create / extract / list / append / update / diff with
 * every common compressor, excludes, -C, --strip-components, GNU vs BSD
 * (macOS) differences, plus the equivalent zip / unzip command.
 */

export type TarState = {
  op: "create" | "extract" | "list" | "append" | "update" | "diff";
  compression: "none" | "gzip" | "bzip2" | "xz" | "zstd" | "auto";
  archive: string;
  paths: string;
  excludes: string;
  dir: string;
  strip: number;
  verbose: boolean;
  preserve: boolean;
  follow: boolean;
  excludeVcs: boolean;
  keepOld: boolean;
  members: string;
  flavor: "gnu" | "bsd";
  long: boolean;
};

export const TAR_DEFAULT: TarState = {
  op: "create",
  compression: "gzip",
  archive: "project-backup.tar.gz",
  paths: "src/ public/ package.json README.md",
  excludes: "node_modules\n*.log\n.env",
  dir: "",
  strip: 0,
  verbose: true,
  preserve: false,
  follow: false,
  excludeVcs: true,
  keepOld: false,
  members: "",
  flavor: "gnu",
  long: false,
};

type Explain = [string, string, string];
type Warn = { level: "warning" | "info" | "error"; message: string };

const sq = (s: string) => (/^[\w@%+=:,./*-]+$/.test(s) && !/\*/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const words = (s: string) => (s.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((w) => w.replace(/^["']|["']$/g, ""));

const EXT: Record<string, string> = { none: ".tar", gzip: ".tar.gz", bzip2: ".tar.bz2", xz: ".tar.xz", zstd: ".tar.zst", auto: ".tar.gz" };
const COMP: Record<string, { short: string; long: string; name: string }> = {
  gzip: { short: "z", long: "--gzip", name: "gzip (fast, universal)" },
  bzip2: { short: "j", long: "--bzip2", name: "bzip2 (smaller, slow)" },
  xz: { short: "J", long: "--xz", name: "xz (smallest, slowest)" },
  zstd: { short: "", long: "--zstd", name: "Zstandard (fast and small; GNU tar 1.31+, bsdtar 3.3.3+)" },
  auto: { short: "a", long: "--auto-compress", name: "choose the compressor from the archive suffix" },
};

export function detectCompression(name: string): TarState["compression"] | null {
  if (/\.(tar\.gz|tgz)$/i.test(name)) return "gzip";
  if (/\.(tar\.bz2|tbz2?)$/i.test(name)) return "bzip2";
  if (/\.(tar\.xz|txz)$/i.test(name)) return "xz";
  if (/\.(tar\.zst|tzst)$/i.test(name)) return "zstd";
  if (/\.tar$/i.test(name)) return "none";
  return null;
}

export function buildTar(s: TarState, o: { multiline: boolean }): { command: string; explain: Explain[]; warnings: Warn[]; zip: string; bsd: string[] } {
  const explain: Explain[] = [];
  const warnings: Warn[] = [];
  const bsdNotes: string[] = [];
  const gnu = s.flavor === "gnu";
  const archive = s.archive.trim() || `archive${EXT[s.compression]}`;
  const detected = detectCompression(archive);
  const opLetter = { create: "c", extract: "x", list: "t", append: "r", update: "u", diff: "d" }[s.op];
  const opLong = { create: "--create", extract: "--extract", list: "--list", append: "--append", update: "--update", diff: "--compare" }[s.op];
  const opMeaning = {
    create: "Create a new archive",
    extract: "Extract files from the archive",
    list: "List the archive's contents",
    append: "Append files to the end of an existing archive",
    update: "Append only files newer than the copy already in the archive",
    diff: "Compare the archive with the files on disk",
  }[s.op];

  // compression
  let comp = s.compression;
  if ((s.op === "append" || s.op === "update") && comp !== "none") {
    warnings.push({ level: "error", message: `tar cannot ${s.op} to a compressed archive — decompress it first (e.g. gunzip ${archive}), ${s.op}, then compress again.` });
    comp = "none";
  }
  if (s.op === "diff" && !gnu) warnings.push({ level: "error", message: "bsdtar (macOS) has no --compare / -d. Install GNU tar (brew install gnu-tar → gtar) or extract to a temp dir and use diff -r." });
  if (s.op === "create" && detected && comp !== "auto" && detected !== comp) warnings.push({ level: "warning", message: `The name ends in ${archive.match(/\.[a-z0-9.]+$/i)?.[0]} but the compression is ${comp === "none" ? "none" : comp} — rename it to …${EXT[comp]} or change the compression.` });
  const extracting = s.op === "extract" || s.op === "list" || s.op === "diff";
  const compFlag = comp !== "none" ? COMP[comp] : null;
  const useComp = compFlag && !(extracting && comp === "auto");

  const bundle: string[] = [];
  const longFlags: string[] = [];
  const addFlag = (short: string, long: string, meaning: string) => {
    if (!s.long && short) bundle.push(short);
    else longFlags.push(long);
    explain.push([!s.long && short ? `-${short}` : long, "", meaning]);
  };
  addFlag(opLetter, opLong, opMeaning);
  if (useComp) {
    addFlag(comp === "zstd" ? "" : compFlag.short, compFlag.long, `Compress with ${compFlag.name}`);
    if (extracting) warnings.push({ level: "info", message: `When reading, both GNU tar and bsdtar detect the compression themselves — ${compFlag.long} is optional for ${s.op}.` });
  }
  if (s.verbose) addFlag("v", "--verbose", s.op === "list" ? "Long listing: permissions, owner, size, date" : "Print each file name as it is processed");
  if (s.preserve && s.op === "extract") addFlag("p", "--preserve-permissions", "Restore the exact permissions (default when run as root)");
  if (s.follow && (s.op === "create" || s.op === "append" || s.op === "update")) addFlag("h", "--dereference", "Archive the files symlinks point to, not the links");
  if (s.keepOld && s.op === "extract") addFlag("k", "--keep-old-files", "Never overwrite existing files");
  // -f goes last in a short bundle: the archive name must follow it
  explain.push([s.long ? "--file" : "-f", archive, "The archive file (use - for stdin/stdout)"]);
  const parts: string[] = s.long ? [...longFlags, `--file=${sq(archive)}`] : ["-" + bundle.join("") + "f", sq(archive), ...longFlags];

  const after: string[] = [];
  const excludes = s.excludes.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
  if (s.op === "create" || s.op === "append" || s.op === "update") {
    if (s.excludeVcs) {
      if (gnu) {
        after.push("--exclude-vcs");
        explain.push(["--exclude-vcs", "", "Skip .git, .svn, .hg and friends (GNU)"]);
      } else {
        excludes.unshift(".git");
        bsdNotes.push("bsdtar has no --exclude-vcs, so .git is excluded explicitly.");
      }
    }
    for (const e of excludes) {
      after.push(`--exclude=${sq(e)}`);
      explain.push(["--exclude", e, `Skip anything matching ${e}${/[*?]/.test(e) ? " (a glob — quoted so the shell leaves it alone)" : ""}`]);
    }
    if (excludes.length && gnu) warnings.push({ level: "info", message: "GNU tar applies --exclude only to paths that come after it, so the excludes are placed before the file list." });
  } else if (excludes.length && s.op === "extract") {
    for (const e of excludes) {
      after.push(`--exclude=${sq(e)}`);
      explain.push(["--exclude", e, `Don't extract members matching ${e}`]);
    }
  }
  if (s.dir.trim()) {
    after.push("-C", sq(s.dir.trim()));
    explain.push(["-C", s.dir.trim(), s.op === "extract" ? "Extract into this directory (it must already exist)" : "Change to this directory first — paths in the archive become relative to it"]);
  }
  if (s.strip > 0 && s.op === "extract") {
    after.push(`--strip-components=${s.strip}`);
    explain.push(["--strip-components", String(s.strip), `Drop the first ${s.strip} directory level${s.strip > 1 ? "s" : ""} from every path (e.g. project-1.2/src/a.js → ${["src/a.js", "a.js"][Math.min(1, s.strip - 1)]})`]);
  }
  if (s.op === "create" && !gnu) {
    bsdNotes.push("macOS bsdtar stores extended attributes as ._ AppleDouble files — prefix COPYFILE_DISABLE=1 (and add --no-mac-metadata) when the archive is for Linux.");
  }
  if (s.op === "create" && gnu) bsdNotes.push("On macOS the same flags work with bsdtar, except --exclude-vcs (use --exclude=.git) and --zstd on older systems.");
  if (s.op === "extract") bsdNotes.push("bsdtar supports --strip-components and -C the same way; it refuses absolute paths and .. unless you pass -P.");

  const paths = words(s.paths);
  const members = words(s.members);
  if (s.op === "create" && !paths.length) warnings.push({ level: "error", message: "List at least one file or directory to archive." });
  if (s.op === "create" || s.op === "append" || s.op === "update" || s.op === "diff") for (const p of paths) after.push(sq(p));
  if ((s.op === "extract" || s.op === "list") && members.length) {
    for (const m of members) after.push(sq(m));
    explain.push(["members", members.join(" "), `Only ${s.op === "extract" ? "extract" : "list"} these paths from the archive`]);
  }
  if (s.op === "create" && paths.some((p) => p.startsWith("/"))) warnings.push({ level: "info", message: "Absolute paths: GNU tar strips the leading / (“Removing leading `/' from member names”) — use -C / to be explicit." });
  if (s.op === "extract" && !s.dir.trim()) warnings.push({ level: "info", message: "Extracting into the current directory — list first (tar -tf) to check for a top-level folder, or use -C." });

  const envPrefix = s.op === "create" && !gnu ? "COPYFILE_DISABLE=1 " : "";
  const bin = `${envPrefix}tar`;
  const all = [...parts, ...after];
  const command = o.multiline ? [bin + " " + parts.join(" "), ...chunk(after)].join(" \\\n  ") : [bin, ...all].join(" ");

  // zip equivalent
  const zipName = archive.replace(/\.(tar(\.(gz|bz2|xz|zst))?|tgz|tbz2?|txz|tzst)$/i, "") + ".zip";
  let zip: string;
  switch (s.op) {
    case "create":
    case "append":
    case "update":
      // zip -x globs match whole paths and * crosses /, so a bare name needs four patterns
      zip = `${s.dir.trim() ? `(cd ${sq(s.dir.trim())} && ` : ""}zip ${s.op === "create" ? "-r" : "-ru"}${s.follow ? "" : "y"} ${sq(zipName)} ${paths.map(sq).join(" ") || "."}${excludes.length ? " -x " + excludes.map((e) => (/[*?/]/.test(e) ? [e] : [e, `${e}/*`, `*/${e}`, `*/${e}/*`]).map((x) => `'${x}'`).join(" ")).join(" ") : ""}${s.dir.trim() ? ")" : ""}`;
      break;
    case "extract":
      zip = `unzip ${s.keepOld ? "-n " : ""}${sq(zipName)}${members.length ? " " + members.map(sq).join(" ") : ""}${s.dir.trim() ? ` -d ${sq(s.dir.trim())}` : ""}${s.strip ? "   # unzip has no --strip-components; move the files afterwards" : ""}`;
      break;
    case "list":
      zip = `unzip -l${s.verbose ? "v" : ""} ${sq(zipName)}`;
      break;
    default:
      zip = `# zip has no compare mode; test integrity with:\nunzip -t ${sq(zipName)}`;
  }
  return { command, explain, warnings, zip, bsd: bsdNotes };
}

function chunk(tokens: string[]): string[] {
  // keep "-C dir" together and put one logical option per line
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "-C") {
      out.push(`-C ${tokens[i + 1]}`);
      i++;
    } else if (tokens[i].startsWith("-")) out.push(tokens[i]);
    else {
      const last = out[out.length - 1];
      if (last && !last.startsWith("-")) out[out.length - 1] = last + " " + tokens[i];
      else out.push(tokens[i]);
    }
  }
  return out;
}
