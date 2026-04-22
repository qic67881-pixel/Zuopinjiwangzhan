import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configRaw = await fs.readFile(path.join(__dirname, "firebase-applet-config.json"), "utf-8");
  const config = JSON.parse(configRaw);

  if (serviceAccount) {
    let sa;
    try {
      sa = JSON.parse(serviceAccount);
    } catch {
      // If it's not JSON, maybe it's base64
      sa = JSON.parse(Buffer.from(serviceAccount, 'base64').toString());
    }
    
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      projectId: config.projectId,
    });
  } else if (process.env.VERCEL) {
    // On Vercel, we might use default credentials if configured in the environment
    admin.initializeApp({
      projectId: config.projectId,
    });
  } else {
    // Local fallback for AI Studio / local dev
    // We try to use application default credentials or just mock it if not available
    try {
      admin.initializeApp({
        projectId: config.projectId,
      });
    } catch (e) {
      console.warn("Firebase Admin failed to initialize. Falling back to local data.json if available.");
    }
  }
  
  if (admin.apps.length > 0) {
    db = admin.firestore();
    // Support custom database ID from config if using Firestore Enterprise
    if (config.firestoreDatabaseId) {
      // @ts-ignore - The types might be slightly behind the experimental/latest SDK features for named databases
      db = admin.firestore(config.firestoreDatabaseId);
    }
  }
} catch (e) {
  console.error("Firebase Admin initialization error:", e);
}

const DATA_FILE = path.join(__dirname, "data.json");
const AUTH_TOKEN = "public-access";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "50mb" }));

const getFirestoreData = async () => {
  if (!db) return null;
  
  try {
    const [projectsSnap, pagesSnap, configSnap, themeSnap] = await Promise.all([
      db.collection("projects").get(),
      db.collection("pages").get(),
      db.collection("settings").doc("config").get(),
      db.collection("settings").doc("theme").get(),
    ]);

    const projects = projectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const pages: any = {};
    pagesSnap.docs.forEach(doc => {
      pages[doc.id] = doc.data();
    });

    return {
      projects,
      pages,
      config: configSnap.data() || {},
      theme: themeSnap.data() || {},
    };
  } catch (e) {
    console.error("Error fetching from Firestore:", e);
    return null;
  }
};

const saveFirestoreData = async (data: any) => {
  if (!db) return false;
  
  try {
    const batch = db.batch();
    
    // We'll support updating specific items or the whole thing if needed
    if (data.config) {
      batch.set(db.collection("settings").doc("config"), data.config, { merge: true });
    }
    if (data.theme) {
      batch.set(db.collection("settings").doc("theme"), data.theme, { merge: true });
    }
    if (data.projects) {
      for (const p of data.projects) {
        batch.set(db.collection("projects").doc(p.id), p, { merge: true });
      }
    }
    if (data.pages) {
      for (const [id, content] of Object.entries(data.pages)) {
        batch.set(db.collection("pages").doc(id), content as any, { merge: true });
      }
    }
    
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Error saving to Firestore:", e);
    return false;
  }
};

// API Routes
app.post("/api/login", (req, res) => {
  return res.json({ success: true, token: AUTH_TOKEN });
});

app.get("/api/data", async (req, res) => {
  let data: any = await getFirestoreData();
  
  if (!data) {
    // Fallback to local data.json
    try {
      const localData = await fs.readFile(DATA_FILE, "utf-8");
      data = JSON.parse(localData);
    } catch (e) {
      data = {};
    }
  }
  
  res.json(data);
});

app.post("/api/data", async (req, res) => {
  const { data, token } = req.body;
  if (token !== AUTH_TOKEN && token !== "authenticated-session-token") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  
  let success = await saveFirestoreData(data);
  
  if (!success) {
    // Fallback to local filesystem
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      success = true;
    } catch (e) {
      console.error("Failed to write to local filesystem:", e);
    }
  }
  
  res.json({ success });
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
