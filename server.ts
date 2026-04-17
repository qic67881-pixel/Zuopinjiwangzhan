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
  app.get("/api/data", async (req, res) => {
    const data = await readData();
    res.json(data || {});
  });

  app.post("/api/data", async (req, res) => {
    const { data } = req.body;
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
  });
}

startServer();
