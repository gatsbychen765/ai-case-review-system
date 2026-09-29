import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { scoreCase, testApiKey, ScoreApiError } from "./api/score.mjs";

function localScoringApi() {
  return {
    name: "local-scoring-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, "http://localhost").pathname;
        if (pathname === "/api/status" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ acceptsUserApiKey: true, modelSelection: "user-configured", keyMode: "user-provided" }));
          return;
        }
        if (pathname !== "/api/score" && pathname !== "/api/test-key") return next();
        if (req.method !== "POST") {
          res.writeHead(405, { "Cache-Control": "no-store" }); res.end(); return;
        }
        try {
          const body = await readJsonBody(req);
          const apiKey = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1] || "";
          const result = pathname === "/api/test-key" ? await testApiKey({ ...body, apiKey }) : await scoreCase({ ...body, apiKey });
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify(result));
        } catch (error) {
          const status = error instanceof ScoreApiError ? error.status : 400;
          res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: error instanceof ScoreApiError ? error.message : "请求内容格式无效。" }));
        }
      });
    },
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 220_000) { reject(new ScoreApiError(413, "请求正文过大。")); req.resume(); }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new ScoreApiError(400, "请求内容格式无效。")); }
    });
    req.on("error", reject);
  });
}

export default defineConfig(() => ({
    base: process.env.VITE_BASE_PATH || "/",
    build: { outDir: "dist/client" },
    optimizeDeps: { include: ["react", "react-dom/client"] },
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      warmup: { clientFiles: ["./src/main.jsx"] },
    },
    plugins: [react(), localScoringApi()],
  }));
