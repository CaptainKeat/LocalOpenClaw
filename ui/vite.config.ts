import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

const nodeStubPath = path.resolve(here, "browser-node-stubs.js");
// Regex that matches any node builtin or subpath (fs, node:fs, fs/promises,
// node:path/posix, ...) so we can alias them all to a single stubs module.
const NODE_BUILTIN_RE =
  /^(?:node:)?(?:fs|os|path|url|module|child_process|v8|tty|perf_hooks|vm|assert|process|util|stream|buffer|crypto|events|zlib|http|https|net|tls|dns|readline|async_hooks|worker_threads|cluster|timers|string_decoder|querystring)(?:\/.*)?$/;

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    resolve: {
      // Redirect any Node-only builtin that sneaks into the browser bundle
      // (via shared source files that the UI transitively imports) to a
      // stubs module that returns empty values. Server code that evaluates
      // these at module-load time no longer crashes in the browser; code
      // that actually runs in Node still uses the real builtin because the
      // alias only applies to the UI Vite build.
      alias: [{ find: NODE_BUILTIN_RE, replacement: nodeStubPath }],
    },
    // `process` is polyfilled on `globalThis` via an inline <script> in
    // ui/index.html that runs before any module code. Vite `define` isn't
    // enough because shared source files dereference `process` as a whole
    // object (`process.execArgv`, `process.execPath`, ...) and `define`
    // only rewrites specific property-access expressions.
    build: {
      outDir: path.resolve(here, "../dist/control-ui"),
      emptyOutDir: true,
      sourcemap: true,
      // Keep CI/onboard logs clean; current control UI chunking is intentionally above 500 kB.
      chunkSizeWarningLimit: 1024,
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
    plugins: [
      {
        name: "control-ui-dev-stubs",
        configureServer(server) {
          server.middlewares.use("/__openclaw/control-ui-config.json", (_req, res) => {
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                basePath: "/",
                assistantName: "",
                assistantAvatar: "",
              }),
            );
          });
        },
      },
    ],
  };
});
