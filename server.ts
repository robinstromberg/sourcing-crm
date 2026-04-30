import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import nodemailer from "nodemailer";
import multer from "multer";
import csv from "csv-parser";
import fs from "fs";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cors());

// --- Database Setup ---
const db = new Database("crm_database.db");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    company TEXT,
    email TEXT UNIQUE,
    category TEXT DEFAULT 'Inköpare',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emails_sent INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Ensure stats row exists
const statsExist = db.prepare("SELECT count(*) as count FROM stats").get();
if (statsExist.count === 0) {
  db.prepare("INSERT INTO stats (emails_sent) VALUES (0)").run();
}

// --- API Routes ---

// Settings
app.get("/api/settings", (req, res) => {
  const stmt = db.prepare("SELECT key, value FROM settings");
  const rows = stmt.all();
  const settings = rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});
  res.json(settings);
});

app.post("/api/settings", (req, res) => {
  const { smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name } = req.body;
  const insert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  
  const entries = Object.entries({ 
    smtp_host, smtp_port, smtp_user, smtp_pass, sender_email, sender_name 
  });
  
  const transaction = db.transaction(() => {
    for (const [key, value] of entries) {
      if (value !== undefined) {
        insert.run(key, String(value));
      }
    }
  });
  
  transaction();
  res.json({ success: true });
});

// Contacts
app.get("/api/contacts", (req, res) => {
  const { search } = req.query;
  let stmt;
  if (search) {
    stmt = db.prepare("SELECT * FROM contacts WHERE name LIKE ? OR company LIKE ? OR email LIKE ? ORDER BY created_at DESC");
    res.json(stmt.all(`%${search}%`, `%${search}%`, `%${search}%`));
  } else {
    stmt = db.prepare("SELECT * FROM contacts ORDER BY created_at DESC");
    res.json(stmt.all());
  }
});

app.post("/api/contacts", (req, res) => {
  const { name, company, email, category } = req.body;
  try {
    const stmt = db.prepare("INSERT INTO contacts (name, company, email, category) VALUES (?, ?, ?, ?)");
    stmt.run(name, company, email, category || 'Producent');
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "Email already exists or invalid data" });
  }
});

// CSV Upload
const upload = multer({ dest: "uploads/" });
app.post("/api/contacts/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      // Auto-map logic
      const entry = {
        name: data.Namn || data.Name || data.name || "",
        company: data.Företag || data.Company || data.company || "",
        email: data.Epost || data.Email || data.email || data["E-post"] || ""
      };
      if (entry.email) results.push(entry);
    })
    .on("end", () => {
      const insert = db.prepare("INSERT OR IGNORE INTO contacts (name, company, email) VALUES (?, ?, ?)");
      const transaction = db.transaction((rows) => {
        for (const row of rows) insert.run(row.name, row.company, row.email);
      });
      transaction(results);
      fs.unlinkSync(req.file.path);
      res.json({ success: true, count: results.length });
    });
});

// Outreach & Mailing
app.post("/api/outreach/send", async (req, res) => {
  const { contactIds, subject, body } = req.body;
  
  // Get SMTP settings
  const settingsRows = db.prepare("SELECT key, value FROM settings").all();
  const settings = settingsRows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {});

  if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_pass) {
    return res.status(400).json({ error: "SMTP-inställningar saknas. Vänligen konfigurera dem först." });
  }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: parseInt(settings.smtp_port) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  });

  // Get contacts
  const placeholders = contactIds.map(() => "?").join(",");
  const contacts = db.prepare(`SELECT * FROM contacts WHERE id IN (${placeholders})`).all(...contactIds);

  res.json({ success: true, message: "Outreach started", total: contacts.length });

  // Handle mailing in background with delay
  for (const contact of contacts) {
    try {
      const personalizedBody = body.replace(/{{namn}}/g, contact.name);
      
      await transporter.sendMail({
        from: `"${settings.sender_name || 'SourcingEU'}" <${settings.sender_email || settings.smtp_user}>`,
        to: contact.email,
        subject: subject,
        text: personalizedBody,
      });

      // Update stats
      db.prepare("UPDATE stats SET emails_sent = emails_sent + 1, last_updated = CURRENT_TIMESTAMP").run();

      // Wait 30 seconds as requested
      if (contacts.indexOf(contact) < contacts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } catch (err) {
      console.error(`Failed to send email to ${contact.email}:`, err);
    }
  }
});

// Stats
app.get("/api/stats", (req, res) => {
  const stats = db.prepare("SELECT * FROM stats").get();
  const categoryCounts = db.prepare("SELECT category, COUNT(*) as count FROM contacts GROUP BY category").all();
  res.json({ ...stats, categories: categoryCounts });
});

// --- Vite Middleware ---
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
