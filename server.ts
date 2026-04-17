import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data.json");
const FALLBACK_PASSWORD = "qicheng1314.";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "50mb" }));

// Helper to read data - NOTE: On Vercel, this will reset frequently
const readData = async () => {
  try {
    const data = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
};

// Helper to write data - NOTE: On Vercel, this will NOT persist permanently
const writeData = async (data: any) => {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("Failed to write to local filesystem on Vercel:", e);
  }
};

// API Routes
const AUTH_TOKEN = "authenticated-session-token";

app.post("/api/login", (req, res) => {
  try {
    const { password } = req.body;
    const inputPassword = ((password as string) || "").trim();
    const targetPassword = ((process.env.ADMIN_PASSWORD as string) || FALLBACK_PASSWORD).trim();

    console.log(`[AUTH] Login Attempt - Received: "${inputPassword}", Expected: "${targetPassword}"`);

    if (inputPassword === targetPassword) {
      return res.json({ success: true, token: AUTH_TOKEN });
    } else {
      return res.status(401).json({ success: false, message: "密码校验失败，请重试" });
    }
  } catch (err) {
    console.error("[AUTH] Server Error:", err);
    return res.status(500).json({ success: false, message: "服务器内部错误" });
  }
});

app.get("/api/data", async (req, res) => {
  try {
    const data = await readData();
    res.json(data || {});
  } catch (err) {
    res.status(500).json({ error: "Failed to read data" });
  }
});

app.post("/api/data", async (req, res) => {
  const { data, token } = req.body;
  if (token !== AUTH_TOKEN) {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  await writeData(data);
  res.json({ success: true });
});

// Vite middleware for development - Optimized for Vercel (Dynamic Import)
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), "dist");
  
  // Check if dist/index.html exists to avoid 500 errors
  try {
    await fs.access(path.join(distPath, "index.html"));
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  } catch (e) {
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "API route not found" });
      }
      res.send("Application is building or static files are missing. Please wait and refresh.");
    });
  }
}

// Only listen if not on Vercel
if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
