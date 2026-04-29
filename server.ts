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
let db: admin.firestore.Firestore | null = null;

try {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  
  let config: any = {};
  try {
    const configRaw = await fs.readFile(configPath, "utf-8");
    config = JSON.parse(configRaw);
  } catch (e) {
    console.warn("Could not read firebase-applet-config.json, using environment variables.");
  }

  // Use environment variables as priority/fallback
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  let sa: any = null;
  
  if (saRaw) {
    try {
      // Strip potential BOM and trim spaces/quotes
      const cleanedSA = saRaw.trim().replace(/^['"]|['"]$/g, '');
      sa = JSON.parse(cleanedSA);
    } catch (e) {
      try {
        sa = JSON.parse(Buffer.from(saRaw, 'base64').toString());
      } catch (b64e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON. Please check the variable content.");
      }
    }
  }

  const projectId = sa?.project_id || config.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
  const dbId = config.firestoreDatabaseId || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;

  if (admin.apps.length === 0) {
    if (sa && projectId) {
      admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: projectId,
      });
      console.log("Firebase Admin initialized with Service Account for project:", projectId);
    } else if (projectId) {
      // ADC or specific projectId
      admin.initializeApp({
        projectId: projectId,
      });
      console.log("Firebase Admin initialized with Project ID:", projectId);
    } else {
      try {
        admin.initializeApp();
        console.log("Firebase Admin initialized with default credentials");
      } catch (e) {
        console.warn("Firebase Admin failed to initialize. Will fallback to local data if available.");
      }
    }
  }
  
  if (admin.apps.length > 0) {
    const app = admin.app();
    if (dbId && dbId !== "(default)") {
      db = getFirestore(app, dbId);
    } else {
      db = getFirestore(app);
    }
    console.log("Firestore initialized successfully");
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
  if (!db) {
    console.warn("Firestore database not initialized. Cannot save to cloud.");
    return false;
  }
  
  try {
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
        } else {
          console.error("Attempted to save project without ID:", p);
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
    // If Firestore fails, check if we have local data as a LAST resort
    try {
      const localData = await fs.readFile(DATA_FILE, "utf-8");
      data = JSON.parse(localData);
      console.log("Using local data.json as fallback");
    } catch (e) {
      data = { projects: [], pages: {}, config: {}, theme: {} };
    }
  }
  
  res.json(data);
});

app.post("/api/data", async (req, res) => {
  const { data, token } = req.body;
  if (token !== AUTH_TOKEN && token !== "authenticated-session-token") {
    return res.status(403).json({ success: false, message: "Unauthorized" });
  }
  
  const success = await saveFirestoreData(data);
  
  // Do NOT write to local filesystem in production (Vercel/Cloud Run)
  if (!success && !process.env.VERCEL) {
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("Local write failed:", e);
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
