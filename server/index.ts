import express, { type Request, Response, NextFunction } from "express";
import { setupVite, serveStatic, log } from "./vite";
import { loadConfig, config } from "./config";

const app = express();

// Special handling for Stripe webhook - must parse as raw before JSON parsing
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Increase JSON body size limit to 10MB for document uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

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

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // The SPA is hosted on Azure Static Web Apps in staging/production, so this
  // process serves the API (and WebSocket) only. In development we still run
  // Vite; set SERVE_CLIENT=true to also serve the built client from this
  // process (e.g. a single-container fallback). The catch-all client routes
  // must be registered last so they don't shadow the API routes.
  if (app.get("env") === "development") {
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
