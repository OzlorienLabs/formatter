/**
 * MySQL command builder: connect, dump / restore, CSV export and import,
 * users & grants, processlist, check & repair — with explanations, safety
 * warnings and a `docker exec` variant.
 */

export type MysqlAction = "connect" | "dump" | "dumpTable" | "schema" | "restore" | "exportCsv" | "importCsv" | "createUser" | "processlist" | "check";

export type MysqlState = {
  action: MysqlAction;
  host: string;
  port: string;
  user: string;
  auth: "prompt" | "env" | "inline" | "loginPath" | "none";
  password: string;
  loginPath: string;
  database: string;
  table: string;
  ssl: "" | "DISABLED" | "PREFERRED" | "REQUIRED" | "VERIFY_CA" | "VERIFY_IDENTITY";
  charset: string;
  singleTransaction: boolean;
  routines: boolean;
  triggers: boolean;
  events: boolean;
  noData: boolean;
  where: string;
  gzip: boolean;
  file: string;
  allDatabases: boolean;
  columnStats: boolean;
  query: string;
  csvFile: string;
  csvHeader: boolean;
  outfile: boolean;
  newUser: string;
  newUserHost: string;
  newPassword: string;
  privileges: string;
  checkMode: "check" | "repair" | "analyze" | "optimize" | "auto-repair";
  docker: boolean;
  container: string;
};

export const MYSQL_DEFAULT: MysqlState = {
  action: "dump",
  host: "localhost",
  port: "3306",
  user: "root",
  auth: "prompt",
  password: "",
  loginPath: "local",
  database: "shop",
  table: "orders",
  ssl: "",
  charset: "utf8mb4",
  singleTransaction: true,
  routines: true,
  triggers: true,
  events: false,
  noData: false,
  where: "",
  gzip: true,
  file: "",
  allDatabases: false,
  columnStats: true,
  query: "SELECT id, email, created_at FROM customers WHERE created_at >= '2025-01-01'",
  csvFile: "customers.csv",
  csvHeader: true,
  outfile: false,
  newUser: "app",
  newUserHost: "%",
  newPassword: "",
  privileges: "SELECT, INSERT, UPDATE, DELETE",
  checkMode: "check",
  docker: false,
  container: "mysql",
};

export const ACTIONS: [MysqlAction, string][] = [
  ["connect", "Connect (interactive shell)"],
  ["dump", "Dump a database"],
  ["dumpTable", "Dump one table"],
  ["schema", "Dump schema only"],
  ["restore", "Restore from a dump"],
  ["exportCsv", "Export a query to CSV"],
  ["importCsv", "Import a CSV (LOAD DATA)"],
  ["createUser", "Create user + grant"],
  ["processlist", "Show running queries"],
  ["check", "Check / repair tables"],
];

type Explain = [string, string, string];
type Warn = { level: "warning" | "info" | "error"; message: string };

const sq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const sqlStr = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const ident = (s: string) => "`" + s.replace(/`/g, "``") + "`";

export function buildMysql(s: MysqlState, o: { multiline: boolean }): { command: string; explain: Explain[]; warnings: Warn[]; docker?: string } {
  const explain: Explain[] = [];
  const warnings: Warn[] = [];
  const a = s.action;
  const tool = a === "dump" || a === "dumpTable" || a === "schema" ? "mysqldump" : a === "check" ? "mysqlcheck" : "mysql";
  const f: string[] = [];
  const add = (flag: string, meaning: string, val?: string) => {
    f.push(val === undefined ? flag : `${flag}${flag.endsWith("=") ? "" : " "}${val}`);
    explain.push([flag.replace(/=$/, ""), val ?? "", meaning]);
  };
  let envPrefix = "";

  // connection
  if (s.auth === "loginPath") add("--login-path=", "Read host, user and password from ~/.mylogin.cnf (set up with mysql_config_editor)", sq(s.loginPath || "local"));
  if (s.host && s.host !== "localhost" || s.auth === "loginPath" && s.host) add("-h", "Server host name or IP", sq(s.host));
  else if (s.host === "localhost") explain.push(["-h", "localhost", "localhost is the default; the client uses the Unix socket, not TCP (use 127.0.0.1 to force TCP)"]);
  if (s.port && s.port !== "3306") add("-P", "TCP port (default 3306)", s.port);
  if (s.auth !== "loginPath" && s.user) add("-u", "User name", sq(s.user));
  if (s.auth === "prompt") add("-p", "Prompt for the password (nothing echoed, nothing in history)");
  if (s.auth === "inline") {
    add(`-p${sq(s.password || "secret")}`, "Password inline — no space after -p");
    warnings.push({ level: "warning", message: "An inline password is saved in shell history and visible to other users in `ps`. mysql even prints “Using a password on the command line interface can be insecure”." });
  }
  if (s.auth === "env") {
    envPrefix = `MYSQL_PWD=${sq(s.password || "secret")} `;
    explain.push(["MYSQL_PWD", "…", "Password from the environment (deprecated since MySQL 8.0; removed in 9.x)"]);
    warnings.push({ level: "warning", message: "MYSQL_PWD is deprecated and readable by other processes on some systems. Prefer -p (prompt) or --login-path." });
  }
  if (s.ssl) add("--ssl-mode=", `TLS: ${s.ssl === "DISABLED" ? "no encryption" : s.ssl === "PREFERRED" ? "encrypt if the server supports it (default)" : s.ssl === "REQUIRED" ? "must encrypt, certificate not verified" : s.ssl === "VERIFY_CA" ? "encrypt and verify the CA" : "encrypt, verify the CA and the host name"}`, s.ssl);
  if (s.ssl === "DISABLED" && s.host && !/^(localhost|127\.0\.0\.1|::1)$/.test(s.host)) warnings.push({ level: "warning", message: "TLS disabled for a remote host — credentials and data travel in clear text." });
  if (s.charset && a !== "check") add("--default-character-set=", "Client character set (utf8mb4 = full Unicode incl. emoji)", s.charset);

  const db = s.database.trim();
  let redirect = "";
  let pipeIn = "";
  switch (a) {
    case "connect":
      if (db) add(db, "Default database");
      break;
    case "dump":
    case "dumpTable":
    case "schema": {
      if (s.singleTransaction && !s.noData && a !== "schema") add("--single-transaction", "Consistent snapshot of InnoDB tables without locking them (START TRANSACTION WITH CONSISTENT SNAPSHOT)");
      if (s.routines) add("--routines", "Include stored procedures and functions");
      if (s.triggers) add("--triggers", "Include triggers (on by default; explicit for clarity)");
      else add("--skip-triggers", "Leave triggers out");
      if (s.events) add("--events", "Include scheduled events");
      if (a === "schema" || s.noData) add("--no-data", "Table definitions only, no rows");
      if (!s.columnStats) add("--column-statistics=0", "Needed when mysqldump 8.x dumps a 5.7 / MariaDB server (no COLUMN_STATISTICS table)");
      add("--set-gtid-purged=OFF", "Don't write SET @@GLOBAL.GTID_PURGED — lets the dump load into servers with their own GTIDs");
      if (a === "dumpTable" && s.where.trim()) add("--where=", "Only rows matching this condition", sq(s.where.trim()));
      if (s.allDatabases && a !== "dumpTable") add("--all-databases", "Every database on the server (incl. mysql system tables)");
      else {
        if (!db) warnings.push({ level: "error", message: "Enter a database name (or tick All databases)." });
        add(sq(db || "mydb"), "Database to dump");
        if (a === "dumpTable") add(sq(s.table || "mytable"), "Only this table (list several separated by spaces)");
      }
      const base = s.file || `${s.allDatabases ? "all-databases" : db || "dump"}${a === "dumpTable" ? "." + (s.table || "table") : ""}${a === "schema" ? ".schema" : ""}-$(date +%F).sql`;
      redirect = s.gzip ? ` | gzip > ${base.replace(/\.gz$/, "")}.gz` : ` > ${base}`;
      explain.push([s.gzip ? "| gzip >" : ">", s.gzip ? `${base.replace(/\.gz$/, "")}.gz` : base, s.gzip ? "Compress on the fly (SQL shrinks 5–10×)" : "Write the SQL to a file"]);
      if (!s.singleTransaction && a !== "schema" && !s.noData) warnings.push({ level: "info", message: "Without --single-transaction mysqldump locks each table while dumping it (--lock-tables), blocking writes." });
      if (s.singleTransaction) warnings.push({ level: "info", message: "--single-transaction only gives a consistent snapshot for InnoDB; MyISAM tables are still read without a lock. Avoid ALTER TABLE while it runs." });
      if (s.allDatabases) warnings.push({ level: "info", message: "--all-databases includes the mysql schema (users and grants) — restoring it onto another server overwrites its users." });
      break;
    }
    case "restore": {
      if (!db) warnings.push({ level: "error", message: "Enter the database to restore into — create it first: CREATE DATABASE shop CHARACTER SET utf8mb4;" });
      add(sq(db || "mydb"), "Database to load into (must exist unless the dump has CREATE DATABASE)");
      const file = s.file || `${db || "dump"}.sql${s.gzip ? ".gz" : ""}`;
      if (s.gzip || /\.gz$/.test(file)) {
        pipeIn = `gunzip < ${sq(file)} | `;
        explain.push(["gunzip <", file, "Decompress the dump and stream it into mysql"]);
      } else {
        redirect = ` < ${sq(file)}`;
        explain.push(["<", file, "Feed the SQL file to mysql on stdin"]);
      }
      if (s.auth === "prompt") warnings.push({ level: "info", message: "With -p and piped input mysql still prompts on the terminal — that works interactively; for scripts use --login-path." });
      warnings.push({ level: "info", message: "Restoring overwrites tables with the same names (dumps contain DROP TABLE IF EXISTS)." });
      break;
    }
    case "exportCsv": {
      const qtext = (s.query || "SELECT 1").trim().replace(/;$/, "");
      if (s.outfile) {
        const sql = `${qtext} INTO OUTFILE ${sqlStr("/var/lib/mysql-files/" + (s.csvFile || "export.csv"))} FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' ESCAPED BY '\\\\' LINES TERMINATED BY '\\n';`;
        if (db) add("-D", "Database", sq(db));
        add("-e", "Run this statement and exit", sq(sql));
        warnings.push({ level: "info", message: "INTO OUTFILE writes on the database server, only inside secure_file_priv (often /var/lib/mysql-files/), and needs the FILE privilege. No header row." });
      } else {
        if (db) add("-D", "Database", sq(db));
        add("--batch", "Tab-separated output, one row per line");
        add("--raw", "Don't escape special characters in the output");
        if (!s.csvHeader) add("--skip-column-names", "No header row");
        add("-e", "Run this query and exit", sq(qtext + ";"));
        redirect = ` | sed -e 's/"/""/g' -e 's/\\t/","/g' -e 's/^/"/' -e 's/$/"/' > ${sq(s.csvFile || "export.csv")}`;
        explain.push(["| sed …", s.csvFile || "export.csv", "Turn the tab-separated rows into quoted CSV (doubles embedded quotes)"]);
        warnings.push({ level: "info", message: "Client-side export: values containing tabs or newlines will break the CSV — use INTO OUTFILE (server side) or a GUI export for those. NULL prints as the text NULL." });
      }
      break;
    }
    case "importCsv": {
      add("--local-infile=1", "Allow LOAD DATA LOCAL on the client side");
      if (db) add("-D", "Database", sq(db));
      const sql = `LOAD DATA LOCAL INFILE ${sqlStr(s.csvFile || "data.csv")} INTO TABLE ${ident(s.table || "mytable")} CHARACTER SET ${s.charset || "utf8mb4"} FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\\n'${s.csvHeader ? " IGNORE 1 LINES" : ""};`;
      add("-e", "Run LOAD DATA and exit", sq(sql));
      warnings.push({ level: "warning", message: "The server must allow it too: SET GLOBAL local_infile = 1; (off by default since MySQL 8.0)." });
      warnings.push({ level: "info", message: "Files saved on Windows end lines with \\r\\n — change LINES TERMINATED BY to '\\r\\n' or the last column keeps a \\r." });
      if (!s.table) warnings.push({ level: "error", message: "Enter the target table." });
      break;
    }
    case "createUser": {
      const who = `${sqlStr(s.newUser || "app")}@${sqlStr(s.newUserHost || "%")}`;
      const pw = s.newPassword || "change-me-please";
      const scope = db ? `${ident(db)}.*` : "*.*";
      const sql = `CREATE USER IF NOT EXISTS ${who} IDENTIFIED BY ${sqlStr(pw)}; GRANT ${s.privileges || "ALL PRIVILEGES"} ON ${scope} TO ${who}; SHOW GRANTS FOR ${who};`;
      add("-e", "Create the account, grant privileges, then show what it can do", sq(sql));
      if (!s.newPassword) warnings.push({ level: "warning", message: "Set a strong password — the placeholder “change-me-please” is in the command." });
      else warnings.push({ level: "warning", message: "The new user's password will be in your shell history; run the SQL inside an interactive mysql session instead if that matters." });
      if (s.newUserHost === "%") warnings.push({ level: "info", message: "Host '%' lets the user connect from anywhere; restrict it (e.g. '10.0.%' or 'localhost') when you can." });
      if (/ALL/i.test(s.privileges) && !db) warnings.push({ level: "warning", message: "ALL PRIVILEGES ON *.* is effectively a second root account." });
      warnings.push({ level: "info", message: "FLUSH PRIVILEGES is not needed after GRANT/CREATE USER — only after editing the grant tables directly." });
      break;
    }
    case "processlist":
      add("-e", "List every connection and its current statement", sq("SHOW FULL PROCESSLIST;"));
      warnings.push({ level: "info", message: "Kill a runaway query with KILL QUERY <Id>; (keeps the connection) or KILL <Id>; (drops it). Needs the PROCESS privilege to see other users." });
      break;
    case "check": {
      const mode = s.checkMode;
      add(`--${mode}`, mode === "check" ? "Check tables for errors" : mode === "repair" ? "Repair corrupted tables (MyISAM/ARCHIVE/CSV; InnoDB doesn't support REPAIR)" : mode === "analyze" ? "Refresh index statistics for the optimizer" : mode === "optimize" ? "Rebuild tables to reclaim space (locks the table; InnoDB rebuilds it)" : "Check, and repair any table that fails");
      if (s.allDatabases) add("--all-databases", "Every database");
      else {
        add(sq(db || "mydb"), "Database");
        if (s.table) add(sq(s.table), "Only this table");
      }
      if (mode === "optimize") warnings.push({ level: "warning", message: "OPTIMIZE copies the whole table — run it off-peak and make sure there is free disk space." });
      break;
    }
  }

  const head = `${pipeIn}${envPrefix}${tool}`;
  let command: string;
  if (o.multiline) command = [head, ...f.map((x) => "  " + x)].join(" \\\n") + redirect;
  else command = [head, ...f].join(" ") + redirect;

  // docker exec variant
  const c = s.container || "mysql";
  const inner = [tool, ...f.filter((x) => !x.startsWith("-h") && !x.startsWith("-P"))].join(" ");
  const pw = s.auth === "prompt" ? inner.replace(/ -p(?= |$)/, ' -p"$MYSQL_ROOT_PASSWORD"') : inner;
  let docker: string;
  if (a === "restore") docker = s.gzip ? `gunzip < ${sq(s.file || `${db || "dump"}.sql.gz`)} | docker exec -i ${c} sh -c '${pw.replace(/'/g, `'\\''`)}'` : `docker exec -i ${c} sh -c '${pw.replace(/'/g, `'\\''`)}' < ${sq(s.file || `${db || "dump"}.sql`)}`;
  else if (a === "connect") docker = `docker exec -it ${c} ${inner}`;
  else docker = `docker exec ${c} sh -c '${pw.replace(/'/g, `'\\''`)}'${redirect}`;
  return { command, explain, warnings, docker };
}
