import express, { type Express } from "express";
import fs from "fs";
import path from "path";

/**
 * Serves the built SPA from this process.
 *
 * Kept separate from server/vite.ts so the production bundle never imports the
 * `vite` package — that is a devDependency and is not installed in the runtime
 * image.
 *
 * The client and API ship in one container, so they are always the same
 * version: no skew between a newly deployed UI and an older API.
 */
export function serveStatic(app: Express) {
  // Bundle lives at dist/index.js, client build at dist/public.
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(
    express.static(distPath, {
      setHeaders(res, filePath) {
        // Vite fingerprints filenames under /assets, so cache them hard.
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // index.html must revalidate, or users keep a stale shell pointing
          // at asset hashes that no longer exist after a deploy.
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );

  // SPA fallback for client-side routes. API paths are excluded: without this
  // an unmatched /api/* request would return index.html with a 200 instead of
  // a JSON 404, which is very confusing to debug from the client.
  app.use("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
