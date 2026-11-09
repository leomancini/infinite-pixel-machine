import 'dotenv/config';
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3133;
const anthropic = new Anthropic();


// SQLite setup
const db = new Database(join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

app.use(express.json());

// Serve static files from dist
app.use(express.static(join(__dirname, "dist")));

// API endpoint for SQLite queries
app.post("/api/query", (req, res) => {
  try {
    const { sql, params = [] } = req.body;
    const stmt = db.prepare(sql);
    if (stmt.reader) {
      const rows = stmt.all(...params);
      res.json({ rows });
    } else {
      const result = stmt.run(...params);
      res.json({ result });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// SPA fallback
app.get("*", (req, res) => {
  res.sendFile(join(__dirname, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

