import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const monacoDirectory = path.join(
  frontendDirectory,
  "node_modules",
  "monaco-editor",
  "min",
  "vs",
);

function serveBundledMonaco() {
  const contentTypes = {
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  return {
    name: "codeclash-bundled-monaco",
    configureServer(server) {
      server.middlewares.use("/monaco", (request, response, next) => {
        if (request.method !== "GET" && request.method !== "HEAD") {
          next();
          return;
        }
        let requestedPath;
        try {
          requestedPath = decodeURIComponent(
            String(request.url || "").split("?")[0],
          );
        } catch {
          response.statusCode = 400;
          response.end();
          return;
        }
        const resolvedPath = path.resolve(monacoDirectory, `.${requestedPath}`);
        if (!resolvedPath.startsWith(`${monacoDirectory}${path.sep}`)) {
          response.statusCode = 403;
          response.end();
          return;
        }
        if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          contentTypes[path.extname(resolvedPath)] || "application/octet-stream",
        );
        response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        if (request.method === "HEAD") {
          response.end();
          return;
        }
        createReadStream(resolvedPath).pipe(response);
      });
    },
    closeBundle() {
      cpSync(monacoDirectory, path.join(frontendDirectory, "dist", "monaco", "vs"), {
        recursive: true,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.CODECLASH_DESKTOP_BUILD === "true" ? "./" : "/",
  plugins: [react(), serveBundledMonaco()],

  server: {
    fs: {
      allow: [fileURLToPath(new URL("../", import.meta.url))],
    },
  },

  preview: {
    allowedHosts: ["ccp-frontend.onrender.com"],
  },
});
