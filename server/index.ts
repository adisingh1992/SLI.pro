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

  // One line at startup naming the deployments this replica will call. Cheap,
  // and it turns "why is the nano classifier behaving oddly" into something you
  // can answer from the log rather than by reading environment variables out of
  // a running container.
  {
    const orchestrator = await import("./orchestrator");
    log(`models: ${orchestrator.describeModels()}`, "orchestrator");
  }

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

    // Azure OpenAI is the only provider, so "which provider" is no longer the
    // useful question — "which deployments" is. A tier with no deployment
    // throws on first use, and that is worth seeing from outside the process
    // rather than discovering when a student sends a turn.
    // Azure OpenAI is the only provider, so "which provider" is no longer the
    // useful question — "which deployments" is.
    //
    // Readiness gates on the endpoint and the mid tier only, and that split is
    // deliberate: `azureDeployment()` falls back to _MID for any tier without
    // its own deployment, so a missing _NANO degrades (nano work runs on mid)
    // while a missing endpoint or _MID cannot serve anything. Taking a replica
    // out of rotation for a survivable gap would be worse than the gap.
    const orchestrator = await import("./orchestrator");
    const llm = orchestrator.modelConfiguration();
    const fatal = !llm.endpoint
      ? "AZURE_OPENAI_ENDPOINT is not set"
      : !llm.deployments.mid
        ? "AZURE_OPENAI_DEPLOYMENT_MID is not set (every tier falls back to it)"
        : null;
    const degraded = Object.entries(llm.deployments)
      .filter(([tier, v]) => !v && tier !== "mid")
      .map(([tier]) => tier);
    checks.llm = fatal
      ? `error: ${fatal}`
      : degraded.length
        ? `degraded: no deployment for ${degraded.join(", ")} — using mid`
        : `ok (${Object.values(llm.deployments).join(", ")})`;

    /*
     * Voice is its own line, and never fatal. A missing Whisper deployment
     * breaks only the microphone; the rest of the page is unaffected, so
     * failing readiness over it would take a working app out of rotation. But
     * it also surfaces nowhere else until a student taps the mic — hence a
     * line here rather than silence.
     */
    const voice = orchestrator.voiceConfiguration();
    checks.voice = voice.deployment
      ? `ok (${voice.deployment})`
      : "unavailable: AZURE_OPENAI_DEPLOYMENT_WHISPER is not set";

    const blob = await import("./blob-storage");
    checks.blobStorage = blob.isConfigured() ? "configured" : "not configured";

    const ready = checks.database === "ok" && !checks.llm.startsWith("error");
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
  // for local development.
  const port = config.port;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
