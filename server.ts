import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let dbInstance: admin.firestore.Firestore | null = null;

async function getDb(): Promise<admin.firestore.Firestore> {
  if (dbInstance) return dbInstance;

  console.log("Attempting to initialize Firestore...");
  
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let config: any = {};
    try {
      const configRaw = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(configRaw);
      console.log("Loaded config from firebase-applet-config.json");
    } catch (e) {
      console.log("firebase-applet-config.json not found, relying on environment variables.");
    }

    const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    let sa: any = null;
    
    if (saRaw) {
      console.log("FIREBASE_SERVICE_ACCOUNT env var detected, length:", saRaw.length);
      try {
        // Strip potential BOM and trim spaces/quotes
        const cleanedSA = saRaw.trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '\n');
        sa = JSON.parse(cleanedSA);
        console.log("Successfully parsed Service Account JSON");
      } catch (e: any) {
        console.error("JSON parse failed for Service Account, trying base64 fallback. Error:", e.message);
        try {
          sa = JSON.parse(Buffer.from(saRaw, 'base64').toString());
          console.log("Successfully parsed Service Account from Base64");
        } catch (b64e: any) {
          console.error("Base64 parse also failed:", b64e.message);
        }
      }
    }

    const projectId = sa?.project_id || config.projectId || process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    const dbId = config.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

    console.log(`Resolved Project ID: ${projectId || "MISSING"}`);
    console.log(`Resolved Database ID: ${dbId || "(default)"}`);

    if (admin.apps.length === 0) {
      if (sa && projectId) {
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          projectId: projectId,
        });
        console.log("Firebase Admin initialized via Cert.");
      } else if (projectId) {
        admin.initializeApp({ projectId });
        console.log("Firebase Admin initialized via Project ID.");
      } else {
        admin.initializeApp();
        console.log("Firebase Admin initialized via Default Application Credentials.");
      }
    }
    
    if (dbId && dbId !== "(default)") {
      // @ts-ignore
      dbInstance = admin.firestore(dbId);
    } else {
      dbInstance = admin.firestore();
    }
    
    if (!dbInstance) throw new Error("Firestore instance creation returned null");
    
    console.log("Firestore initialized successfully!");
    return dbInstance;
  } catch (err: any) {
    console.error("DB Initialization FATAL ERROR:", err.message);
    throw err;
  }
}

const DATA_FILE = path.join(process.cwd(), "data.json");
const AUTH_TOKEN = "public-access";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

app.use(express.json({ limit: "50mb" }));

const getFirestoreData = async () => {
  try {
    const db = await getDb();
    console.log("Starting Firestore data fetch...");
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

    console.log(`Fetch successful: ${projects.length} projects, ${Object.keys(pages).length} pages`);
    return {
      projects,
      pages,
      config: configSnap.data() || {},
      theme: themeSnap.data() || {},
    };
  } catch (e: any) {
    console.error("Firestore fetch error details:", e);
    return null;
  }
};

const saveFirestoreData = async (data: any) => {
  try {
    const db = await getDb();
    const batch = db.batch();
    let hasOps = false;
    
    if (data.config) {
      batch.set(db.collection("settings").doc("config"), data.config, { merge: true });
      hasOps = true;
    }
    if (data.theme) {
      batch.set(db.collection("settings").doc("theme"), data.theme, { merge: true });
      hasOps = true;
    }
    if (data.projects && Array.isArray(data.projects)) {
      for (const p of data.projects) {
        if (p.id) {
          batch.set(db.collection("projects").doc(p.id), p, { merge: true });
          hasOps = true;
        }
      }
    }
    if (data.pages) {
      for (const [id, content] of Object.entries(data.pages)) {
        batch.set(db.collection("pages").doc(id), content as any, { merge: true });
        hasOps = true;
      }
    }
    
    if (hasOps) {
      await batch.commit();
      console.log("Successfully committed batch to Firestore");
      return true;
    }
    return false;
  } catch (e: any) {
    const errorMsg = e?.message || String(e);
    console.error("Firestore save error:", errorMsg);
    if (errorMsg.includes("too large")) {
      throw new Error("Payload too large: The image or project data exceeds the 1MB Firestore limit. Please upload a smaller image or use a URL.");
    }
    throw new Error(`Firestore save failed: ${errorMsg}`);
  }
};

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    firestore: dbInstance ? "initialized" : "uninitialized",
    env: process.env.VERCEL ? "vercel" : "other"
  });
});

app.post("/api/login", (req, res) => {
  return res.json({ success: true, token: AUTH_TOKEN });
});

app.get("/api/data", async (req, res) => {
  console.log("Fetching data requested...");
  let data: any = await getFirestoreData();
  
  if (!data) {
    console.warn("Firestore data fetch returned null, falling back to local file if it exists.");
    // If Firestore fails, check if we have local data as a LAST resort
    try {
      const localData = await fs.readFile(DATA_FILE, "utf-8");
      data = JSON.parse(localData);
      console.log("Using local data.json as fallback");
    } catch (e) {
      console.warn("Local data.json fallback failed or file missing.");
      data = { projects: [], pages: {}, config: {}, theme: {} };
    }
  } else {
    console.log(`Successfully fetched from Firestore. Projects count: ${data.projects?.length || 0}`);
  }
  
  res.json(data);
});

app.post("/api/data", async (req, res) => {
  const { data, token } = req.body;
  if (token !== AUTH_TOKEN && token !== "authenticated-session-token") {
    console.warn("Unauthorized API access attempt");
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  
  console.log(`Received data save request. Keys: ${Object.keys(data).join(", ")}`);
  
  try {
    const success = await saveFirestoreData(data);
    return res.json({ success });
  } catch (err: any) {
    const errorMessage = err?.message || "Unknown server error";
    console.error("API save error:", errorMessage);
    
    // In case Firestore fails, try saving locally as fallback if not in read-only env
    let localSaved = false;
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      localSaved = true;
      console.log("Fallback: Data saved to local data.json despite Firestore error");
    } catch (e) {
      // Local write failed (likely read-only environment)
    }

    return res.status(500).json({ 
      success: false, 
      message: errorMessage,
      fallback: localSaved
    });
  }
});

app.delete("/api/data", async (req, res) => {
  const { projectId, token } = req.body;
  if (token !== AUTH_TOKEN && token !== "authenticated-session-token") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }

  try {
    const db = await getDb();
    console.log(`Deleting project: ${projectId}`);
    await db.collection("projects").doc(projectId).delete();
    res.json({ success: true });
  } catch (e: any) {
    console.error("Error deleting from Firestore:", e?.message);
    res.status(500).json({ success: false, error: e?.message });
  }
});

// Setup Rendering
const distPath = path.join(process.cwd(), "dist");

if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
  app.use(express.static(distPath));
  app.get("*", async (req, res) => {
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
