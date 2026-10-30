require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const slugify = require("slugify");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, "uploads");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD_HASH) {
  console.error("Setup required: copy .env.example to .env and set SESSION_SECRET and ADMIN_PASSWORD_HASH.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.set("trust proxy", 1);
app.use(session({
  store: new SQLiteStore({
    dir: DATA_DIR,
    db: "sessions.sqlite",
    table: "sessions",
    concurrentDB: true
  }),
  name: "dm.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।" }
});

const db = new Database(path.join(DATA_DIR, "news.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS articles (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 slug TEXT NOT NULL UNIQUE,
 category TEXT NOT NULL,
 summary TEXT NOT NULL DEFAULT '',
 body TEXT NOT NULL,
 image TEXT NOT NULL DEFAULT '',
 author TEXT NOT NULL DEFAULT 'দৈনিক মহেশপুর ডেস্ক',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
`);
const allArticles = db.prepare("SELECT COUNT(*) AS n FROM articles").get().n;
if (!allArticles) {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO articles (title,slug,category,summary,body,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(
      "দৈনিক মহেশপুরে স্বাগতম", "dainik-moheshpur-e-swagatom", "মহেশপুর",
      "এটি নমুনা সংবাদ। Admin Panel থেকে এটি সম্পাদনা বা মুছে নিজের সংবাদ প্রকাশ করুন।",
      "এটি একটি নমুনা সংবাদ, বাস্তব খবর নয়। Admin Panel-এ লগইন করে শিরোনাম, বিভাগ, ছবি ও সংবাদবিবরণ পরিবর্তন করুন।", "published", now, now
    );
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, crypto.randomBytes(16).toString("hex") + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype)) {
      return cb(new Error("শুধু JPG, PNG, WEBP বা GIF ছবি আপলোড করা যাবে।"));
    }
    cb(null, true);
  }
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) return next();
  return res.status(401).json({ error: "অনুগ্রহ করে Admin Panel-এ লগইন করুন।" });
}
function safeArticle(row) { return row || null; }

app.use(express.static(path.join(ROOT, "public")));
app.get("/admin", (_req, res) => res.sendFile(path.join(ROOT, "public", "admin.html")));
app.get("/api/health", (_req, res) => res.json({ ok: true, name: "Dainik Moheshpur" }));

app.get("/api/articles", (req, res) => {
  const category = String(req.query.category || "").trim();
  const search = String(req.query.search || "").trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit || "50", 10) || 50, 1), 100);
  let sql = "SELECT id,title,slug,category,summary,body,image,author,status,created_at,updated_at FROM articles WHERE status='published'";
  const params = [];
  if (category) { sql += " AND category=?"; params.push(category); }
  if (search) { sql += " AND (title LIKE ? OR summary LIKE ? OR body LIKE ?)"; const q = `%${search}%`; params.push(q,q,q); }
  sql += " ORDER BY datetime(created_at) DESC LIMIT ?";
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});
app.get("/api/articles/:slug", (req, res) => {
  const row = db.prepare("SELECT id,title,slug,category,summary,body,image,author,status,created_at,updated_at FROM articles WHERE slug=? AND status='published'").get(req.params.slug);
  if (!row) return res.status(404).json({ error: "সংবাদ পাওয়া যায়নি।" });
  res.json(safeArticle(row));
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME || "admin";
  if (username !== expectedUser || typeof password !== "string" ||
      !bcrypt.compareSync(password, process.env.ADMIN_PASSWORD_HASH)) {
    return res.status(401).json({ error: "ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।" });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "লগইন করা যায়নি।" });
    req.session.admin = true;
    res.json({ ok: true });
  });
});
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/admin/me", (req, res) => res.json({ loggedIn: !!(req.session && req.session.admin) }));
app.get("/api/admin/articles", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM articles ORDER BY datetime(updated_at) DESC").all());
});

app.post("/api/admin/upload", requireAdmin, (req, res) => {
  upload.single("image")(req, res, err => {
    if (err) return res.status(400).json({ error: err.message || "ছবি আপলোড ব্যর্থ হয়েছে।" });
    if (!req.file) return res.status(400).json({ error: "একটি ছবি নির্বাচন করুন।" });
    res.json({ image: "/uploads/" + req.file.filename });
  });
});

function cleanText(value, max = 20000) {
  return String(value || "").trim().slice(0, max);
}
function createSlug(title) {
  const ascii = slugify(title, { lower: true, strict: true, trim: true });
  return (ascii || "news") + "-" + crypto.randomBytes(3).toString("hex");
}
app.post("/api/admin/articles", requireAdmin, (req, res) => {
  const title = cleanText(req.body.title, 240);
  const category = cleanText(req.body.category, 80);
  const summary = cleanText(req.body.summary, 600);
  const body = cleanText(req.body.body, 20000);
  const image = cleanText(req.body.image, 500);
  const author = cleanText(req.body.author, 120) || "দৈনিক মহেশপুর ডেস্ক";
  const status = req.body.status === "published" ? "published" : "draft";
  if (!title || !category || !body) return res.status(400).json({ error: "শিরোনাম, বিভাগ ও সংবাদবিবরণ পূরণ করুন।" });
  const now = new Date().toISOString();
  try {
    const result = db.prepare(`INSERT INTO articles(title,slug,category,summary,body,image,author,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(title, createSlug(title), category, summary, body, image, author, status, now, now);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) { res.status(500).json({ error: "সংবাদ সংরক্ষণ করা যায়নি।" }); }
});
app.put("/api/admin/articles/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare("SELECT * FROM articles WHERE id=?").get(id);
  if (!old) return res.status(404).json({ error: "সংবাদ পাওয়া যায়নি।" });
  const title = cleanText(req.body.title, 240);
  const category = cleanText(req.body.category, 80);
  const summary = cleanText(req.body.summary, 600);
  const body = cleanText(req.body.body, 20000);
  const image = cleanText(req.body.image, 500);
  const author = cleanText(req.body.author, 120) || "দৈনিক মহেশপুর ডেস্ক";
  const status = req.body.status === "published" ? "published" : "draft";
  if (!title || !category || !body) return res.status(400).json({ error: "শিরোনাম, বিভাগ ও সংবাদবিবরণ পূরণ করুন।" });
  db.prepare(`UPDATE articles SET title=?,category=?,summary=?,body=?,image=?,author=?,status=?,updated_at=? WHERE id=?`)
    .run(title, category, summary, body, image, author, status, new Date().toISOString(), id);
  res.json({ ok: true });
});
app.delete("/api/admin/articles/:id", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM articles WHERE id=?").get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "সংবাদ পাওয়া যায়নি।" });
  db.prepare("DELETE FROM articles WHERE id=?").run(row.id);
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "সার্ভারে সমস্যা হয়েছে।" });
});
app.listen(PORT, () => console.log(`Dainik Moheshpur running at http://localhost:${PORT}`));
