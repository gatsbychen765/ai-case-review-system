import { handleModelRequest } from "../api/score.mjs";
function apiCorsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== env.CORS_ALLOWED_ORIGIN) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function addApiCors(response, request, env) {
  const cors = apiCorsHeaders(request, env);
  if (!cors) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(cors)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      const headers = apiCorsHeaders(request, env);
      return headers ? new Response(null, { status: 204, headers }) : new Response(null, { status: 403 });
    }
    const response = await handleRequest(request, env);
    return url.pathname.startsWith("/api/") ? addApiCors(response, request, env) : response;
  },
};

async function handleRequest(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/status" && request.method === "GET") {
      return Response.json({ acceptsUserApiKey: true, modelSelection: "user-configured", keyMode: "user-provided" }, { headers: { "Cache-Control": "no-store" } });
    }

    if (["/api/score", "/api/test-key", "/api/models"].includes(url.pathname) && request.method === "POST") {
      return handleModelRequest(request, url.pathname);
    }

    if (!env.ASSETS) return new Response("Not Found", { status: 404 });
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
}
