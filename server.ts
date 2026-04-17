import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "data.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456abc";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // Helper to read data
  const readData = async () => {
    try {
      const data = await fs.readFile(DATA_FILE, "utf-8");
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  };

  // Helper to write data
  const writeData = async (data: any) => {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  };

  // API Routes
  const AUTH_TOKEN = "authenticated-session-token";

  app.post("/api/login", (req, res) => {
    try {
      const { password } = req.body;
      const inputPassword = ((password as string) || "").trim();
      const targetPassword = ((process.env.ADMIN_PASSWORD as string) || "qicheng1314.").trim();

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
    const data = await readData();
    res.json(data || {});
  });

  app.post("/api/data", async (req, res) => {
    const { data, token } = req.body;
    if (token !== AUTH_TOKEN) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }
    await writeData(data);
    res.json({ success: true });
  });

  // Vite middleware for development
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
    console.log(`Admin password is set to: ${ADMIN_PASSWORD}`);
  });
}

startServer();
