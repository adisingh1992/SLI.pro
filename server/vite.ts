/**
 * Vite dev server integration — DEVELOPMENT ONLY.
 *
 * This module imports `vite`, a devDependency. It must never be reachable
 * from the production bundle; server/index.ts imports it dynamically and only
 * when running in development.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { log } from "./logger";
import { config } from "./config";

const viteLogger = createLogger();


export async function setupVite(app: Express, server: Server) {
  /*
   * ── HMR NEEDS TO BE TOLD THE PORT ────────────────────────────────────────
   * In middleware mode Vite shares this HTTP server, so there is no separate
   * dev-server port for it to infer from. Without `clientPort` the injected
   * client builds its socket URL from a port it never received and produces:
   *
   *   WebSocket connection to 'ws://localhost:undefined/?token=…' failed
   *   SyntaxError: Failed to construct 'WebSocket': The URL is invalid.
   *
   * That is not cosmetic. When the HMR socket never connects, edits do not hot
   * apply — the browser keeps running whatever bundle it loaded, so saving a
   * file appears to do nothing and the page has to be hard-reloaded to pick up
   * a change. Two separate rounds of debugging this session were spent on a
   * stale bundle before the console error was read.
   */
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, clientPort: config.port },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
