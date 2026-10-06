import handler, { MAX_BODY_BYTES } from "../api/analyze.js";

export function researchApiPlugin(serverHandler = handler) {
  return {
    name: "research-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/api/analyze") return next();
        const response = {
          setHeader: (key, value) => res.setHeader(key, value),
          status(code) { res.statusCode = code; return this; },
          json(body) { res.setHeader("Content-Type", "application/json; charset=utf-8"); res.end(JSON.stringify(body)); },
        };
        try {
          if (req.method !== "POST") return await serverHandler(req, response);
          let size = 0;
          const chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
              response.status(413).json({ error: "요청 내용이 너무 큽니다." });
              return;
            }
            chunks.push(chunk);
          }
          try { req.body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
          catch { return response.status(400).json({ error: "올바른 JSON 요청이 필요합니다." }); }
          await serverHandler(req, response);
        } catch {
          if (!res.writableEnded) response.status(500).json({ error: "분석 요청 처리에 실패했습니다." });
        }
      });
    },
  };
}
