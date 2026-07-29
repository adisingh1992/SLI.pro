import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { log } from "./logger";
import { loadConfig, config } from "./config";

const app = express();

// Special handling for Stripe webhook - must parse as raw before JSON parsing
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Increase JSON body size limit to 10MB for document uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

/**
 * Liveness probe for Container Apps ingress and the Docker HEALTHCHECK.
 *
 * Deliberately does NOT touch the database: this answers "is the process
 * serving?", and a slow or briefly unavailable database should not cause
 * Container Apps to kill and reschedule healthy replicas. Dependency health is
 * reported separately at /api/health/ready.
 */
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load secrets from Key Vault (if configured) and validate required config
  // BEFORE importing route modules, which read process.env at import time.
  await loadConfig();
  const { registerRoutes } = await import("./routes");

  // Readiness: reports whether backing services are reachable. Used for
  // deployment gating and diagnostics, not for liveness.
  app.get("/api/health/ready", async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      const { pool } = await import("./db");
      await pool.query("SELECT 1");
      checks.database = "ok";
    } catch (err: any) {
      checks.database = `error: ${err?.message ?? err}`;
    }

    const orchestrator = await import("./orchestrator");
    checks.llmProvider = orchestrator.activeProvider();

    const blob = await import("./blob-storage");
    checks.blobStorage = blob.isConfigured() ? "configured" : "not configured";

    const ready = checks.database === "ok";
    res.status(ready ? 200 : 503).json({ ready, checks });
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Single-container deployment: this process serves the SPA, the API and the
  // WebSocket. In development Vite handles the client with HMR; in production
  // the built client is served from dist/public (SERVE_CLIENT=true).
  // The catch-all client route is registered last so it cannot shadow the API.
  if (app.get("env") === "development") {
    // Imported dynamically: `vite` is a devDependency and is absent from the
    // production image, so a static import would break the container.
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else if (config.serveClient) {
    serveStatic(app);
  }

  // Port comes from the environment (Container Apps sets PORT); default 5000
  // preserves local/Replit behaviour.
  const port = config.port;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
