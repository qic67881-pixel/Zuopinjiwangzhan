import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data.json");
const AUTH_TOKEN = "public-access";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

const readData = async () => {
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
};

const writeData = async (data: any) => {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write to local filesystem:", e);
  }
};

// API Routes
app.post("/api/login", (req, res) => {
  return res.json({ success: true, token: AUTH_TOKEN });
});

app.get("/api/data", async (req, res) => {
  const data = await readData();
  res.json(data || {});
});

app.post("/api/data", async (req, res) => {
  const { data, token } = req.body;
  if (token !== AUTH_TOKEN && token !== "authenticated-session-token") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  await writeData(data);
  res.json({ success: true });
});

// Setup Rendering
const distPath = path.join(process.cwd(), "dist");

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) return res.status(404).json({ error: "API not found" });
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  // Use Vite in development (AI Studio)
  try {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } catch (e) {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export default app;
