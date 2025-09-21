var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/index.ts
import express2 from "express";

// server/vite.ts
import express from "express";
import fs from "fs";
import path2 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  base: "./",
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/routes.ts
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  insertPoseAnalysisSchema: () => insertPoseAnalysisSchema,
  insertSessionSchema: () => insertSessionSchema,
  insertUserSchema: () => insertUserSchema,
  poseAnalysis: () => poseAnalysis,
  sessions: () => sessions,
  users: () => users
});
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  startTime: timestamp("start_time").notNull().defaultNow(),
  endTime: timestamp("end_time"),
  duration: integer("duration"),
  // in seconds
  plankType: text("plank_type").notNull(),
  // 'high' or 'elbow'
  averageScore: real("average_score"),
  bodyAlignmentScore: real("body_alignment_score"),
  kneePositionScore: real("knee_position_score"),
  shoulderStackScore: real("shoulder_stack_score"),
  completed: boolean("completed").notNull().default(false)
});
var poseAnalysis = pgTable("pose_analysis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => sessions.id),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  bodyAlignmentAngle: real("body_alignment_angle"),
  kneeAngle: real("knee_angle"),
  shoulderStackAngle: real("shoulder_stack_angle"),
  bodyAlignmentScore: real("body_alignment_score"),
  kneePositionScore: real("knee_position_score"),
  shoulderStackScore: real("shoulder_stack_score"),
  overallScore: real("overall_score"),
  feedback: text("feedback")
});
var insertUserSchema = createInsertSchema(users).omit({
  id: true
});
var insertSessionSchema = createInsertSchema(sessions).omit({
  id: true,
  startTime: true,
  endTime: true
});
var insertPoseAnalysisSchema = createInsertSchema(poseAnalysis).omit({
  id: true,
  timestamp: true
});

// server/storage.ts
import { randomUUID } from "crypto";

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema: schema_exports });

// server/storage.ts
import { eq, desc } from "drizzle-orm";
var MemStorage = class {
  users;
  sessions;
  poseAnalysis;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Map();
    this.poseAnalysis = /* @__PURE__ */ new Map();
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async createSession(insertSession) {
    const id = randomUUID();
    const session = {
      userId: insertSession.userId || null,
      plankType: insertSession.plankType,
      id,
      startTime: /* @__PURE__ */ new Date(),
      endTime: null,
      duration: null,
      averageScore: null,
      bodyAlignmentScore: null,
      kneePositionScore: null,
      shoulderStackScore: null,
      completed: false
    };
    this.sessions.set(id, session);
    return session;
  }
  async getSession(id) {
    const session = this.sessions.get(id);
    return session;
  }
  async updateSession(id, updates) {
    const session = this.sessions.get(id);
    if (!session) {
      return void 0;
    }
    const updatedSession = { ...session, ...updates };
    this.sessions.set(id, updatedSession);
    return updatedSession;
  }
  async getUserSessions(userId) {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId
    );
  }
  async createPoseAnalysis(insertAnalysis) {
    const id = randomUUID();
    const analysis = {
      sessionId: insertAnalysis.sessionId,
      bodyAlignmentAngle: insertAnalysis.bodyAlignmentAngle || null,
      kneeAngle: insertAnalysis.kneeAngle || null,
      shoulderStackAngle: insertAnalysis.shoulderStackAngle || null,
      bodyAlignmentScore: insertAnalysis.bodyAlignmentScore || null,
      kneePositionScore: insertAnalysis.kneePositionScore || null,
      shoulderStackScore: insertAnalysis.shoulderStackScore || null,
      overallScore: insertAnalysis.overallScore || null,
      feedback: insertAnalysis.feedback || null,
      id,
      timestamp: /* @__PURE__ */ new Date()
    };
    this.poseAnalysis.set(id, analysis);
    return analysis;
  }
  async getSessionAnalysis(sessionId) {
    return Array.from(this.poseAnalysis.values()).filter(
      (analysis) => analysis.sessionId === sessionId
    );
  }
};
var DatabaseStorage = class {
  memStorage = new MemStorage();
  async getUser(id) {
    try {
      const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.getUser(id);
    }
  }
  async getUserByUsername(username) {
    try {
      const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.getUserByUsername(username);
    }
  }
  async createUser(insertUser) {
    try {
      const result = await db.insert(users).values(insertUser).returning();
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.createUser(insertUser);
    }
  }
  async createSession(insertSession) {
    try {
      const result = await db.insert(sessions).values(insertSession).returning();
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.createSession(insertSession);
    }
  }
  async getSession(id) {
    try {
      const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.getSession(id);
    }
  }
  async updateSession(id, updates) {
    try {
      const processedUpdates = { ...updates };
      if (processedUpdates.endTime && typeof processedUpdates.endTime === "string") {
        processedUpdates.endTime = new Date(processedUpdates.endTime);
      }
      if (processedUpdates.startTime && typeof processedUpdates.startTime === "string") {
        processedUpdates.startTime = new Date(processedUpdates.startTime);
      }
      const result = await db.update(sessions).set(processedUpdates).where(eq(sessions.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      let memorySession = await this.memStorage.getSession(id);
      if (!memorySession) {
        try {
          const dbSession = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
          if (dbSession[0]) {
            this.memStorage["sessions"].set(id, dbSession[0]);
          }
        } catch (dbError) {
          console.error("Could not retrieve session from database:", dbError);
        }
      }
      return this.memStorage.updateSession(id, updates);
    }
  }
  async getUserSessions(userId) {
    try {
      return await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.startTime));
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.getUserSessions(userId);
    }
  }
  async createPoseAnalysis(insertAnalysis) {
    try {
      const result = await db.insert(poseAnalysis).values(insertAnalysis).returning();
      return result[0];
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.createPoseAnalysis(insertAnalysis);
    }
  }
  async getSessionAnalysis(sessionId) {
    try {
      return await db.select().from(poseAnalysis).where(eq(poseAnalysis.sessionId, sessionId)).orderBy(desc(poseAnalysis.timestamp));
    } catch (error) {
      console.error("Database error, using memory storage:", error);
      return this.memStorage.getSessionAnalysis(sessionId);
    }
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
async function registerRoutes(app2) {
  const httpServer = createServer(app2);
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false
  });
  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws2) => {
        wss.emit("connection", ws2, request);
      });
    } else {
      socket.destroy();
    }
  });
  wss.on("connection", (ws2, req) => {
    console.log("Client connected to pose analysis WebSocket from:", req.url);
    ws2.send(JSON.stringify({ type: "connected", message: "WebSocket connected successfully" }));
    ws2.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === "pose_analysis") {
          if (message.sessionId && message.data) {
            await storage.createPoseAnalysis({
              sessionId: message.sessionId,
              ...message.data
            });
          }
          wss.clients.forEach((client) => {
            if (client !== ws2 && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });
    ws2.on("close", () => {
      console.log("Client disconnected from pose analysis WebSocket");
    });
    ws2.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });
  app2.post("/api/sessions", async (req, res) => {
    try {
      const sessionData = insertSessionSchema.parse(req.body);
      const session = await storage.createSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "Invalid session data" });
    }
  });
  app2.get("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch session" });
    }
  });
  app2.patch("/api/sessions/:id", async (req, res) => {
    try {
      const session = await storage.updateSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ message: "Session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to update session" });
    }
  });
  app2.get("/api/sessions/:id/analysis", async (req, res) => {
    try {
      const analysis = await storage.getSessionAnalysis(req.params.id);
      res.json(analysis);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch analysis data" });
    }
  });
  return httpServer;
}

// server/index.ts
var app = express2();
var PORT = parseInt(process.env.PORT || "5000");
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path3 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path3.startsWith("/api")) {
      let logLine = `${req.method} ${path3} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  server.listen({
    port: PORT,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${PORT}`);
  });
})();
