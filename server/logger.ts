/**
 * Minimal logger.
 *
 * Deliberately has NO dependencies. `log` used to live in server/vite.ts,
 * which meant every module importing it also pulled in `vite`, `vite.config`
 * and its plugins — all devDependencies. The production image installs with
 * `--omit=dev`, so the bundled server crashed at startup with
 * "Cannot find package 'vite'".
 *
 * Anything that needs logging imports from here; only the dev server imports
 * from ./vite.
 */
export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}
