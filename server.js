// M2 Top 25 Poll - backend
//
// A tiny generic document store (like the Firestore-style doc/collection
// model the frontend was originally written against) backed by SQLite,
// plus a password-gated admin delete so the site owner can clean up bad
// entries without needing real user accounts.

const express = require("express");
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
app.use(express.json({ limit: "2mb" }));

// ---------- Storage ----------
// Uses Node's built-in sqlite module (no native compilation / node-gyp
// step required, unlike better-sqlite3) - needs Node 22.5+.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

// Snapshot the database before touching it, every time the server starts
// (i.e. on every deploy). A code change should never cost existing
// submissions - this is the safety net in case one ever does.
function backupDatabaseOnBoot() {
  const dbFile = path.join(dataDir, "poll.db");
  if (!fs.existsSync(dbFile)) return;
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  ["poll.db", "poll.db-wal", "poll.db-shm"].forEach((name) => {
    const src = path.join(dataDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(backupDir, `${stamp}_${name}`));
  });
  // Keep the most recent 30 backups (~a month of daily deploys) so this
  // doesn't grow the disk unbounded.
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith("poll.db")).sort();
  while (files.length > 30) {
    const stampPrefix = files.shift().replace(/poll\.db$/, "");
    ["poll.db", "poll.db-wal", "poll.db-shm"].forEach((name) => {
      const f = path.join(backupDir, stampPrefix + name);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }
}
backupDatabaseOnBoot();

const db = new DatabaseSync(path.join(dataDir, "poll.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    path TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const getStmt = db.prepare("SELECT data FROM documents WHERE path = ?");
const setStmt = db.prepare(`
  INSERT INTO documents (path, data, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`);
const deleteStmt = db.prepare("DELETE FROM documents WHERE path = ?");
const prefixStmt = db.prepare("SELECT path, data FROM documents WHERE path LIKE ? ORDER BY path");

function isDirectChild(fullPath, prefix) {
  const rest = fullPath.slice(prefix.length + 1);
  return rest.length > 0 && !rest.includes("/");
}

function isValidPath(p) {
  return typeof p === "string" && p.length > 0 && p.length <= 1000 &&
    /^[A-Za-z0-9_\-.~:@+/]+$/.test(p) && !p.includes("//");
}

// ---------- Admin auth ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
function requireAdmin(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "admin_not_configured" });
  const supplied = req.get("x-admin-password") || "";
  if (supplied !== ADMIN_PASSWORD) return res.status(401).json({ error: "unauthorized" });
  next();
}

// ---------- Document store API ----------
app.get("/api/doc/*", (req, res) => {
  const p = req.params[0];
  if (!isValidPath(p)) return res.status(400).json({ error: "invalid_path" });
  const row = getStmt.get(p);
  if (!row) return res.json({ exists: false, data: null });
  res.json({ exists: true, data: JSON.parse(row.data) });
});

app.put("/api/doc/*", (req, res) => {
  const p = req.params[0];
  if (!isValidPath(p)) return res.status(400).json({ error: "invalid_path" });
  if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
    return res.status(400).json({ error: "invalid_body" });
  }
  setStmt.run(p, JSON.stringify(req.body), new Date().toISOString());
  res.json({ ok: true });
});

app.delete("/api/doc/*", requireAdmin, (req, res) => {
  const p = req.params[0];
  if (!isValidPath(p)) return res.status(400).json({ error: "invalid_path" });
  deleteStmt.run(p);
  res.json({ ok: true });
});

app.get("/api/collection/*", (req, res) => {
  const p = req.params[0];
  if (!isValidPath(p)) return res.status(400).json({ error: "invalid_path" });
  const rows = prefixStmt.all(p + "/%");
  const docs = rows
    .filter((r) => isDirectChild(r.path, p))
    .map((r) => ({ id: r.path.slice(p.length + 1), data: JSON.parse(r.data) }));
  res.json({ docs });
});

// Lets the frontend know (without leaking the password) whether admin mode is usable at all.
app.get("/api/admin/check", (req, res) => {
  res.json({ configured: !!ADMIN_PASSWORD, authorized: ADMIN_PASSWORD ? (req.get("x-admin-password") || "") === ADMIN_PASSWORD : false });
});

// ---------- Static frontend ----------
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`M2 Top 25 Poll listening on port ${PORT}`);
  if (!ADMIN_PASSWORD) console.log("NOTE: ADMIN_PASSWORD is not set - admin delete actions are disabled.");
});
