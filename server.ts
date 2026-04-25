import dotenv from "dotenv";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TranslateRequestError,
  parseTranslateRequest,
  translateChineseToFrench,
} from "./server/translate";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3000);
const host = "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";
const rootDir = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json({ limit: "16kb" }));

app.post("/api/translate", async (req, res) => {
  try {
    const text = parseTranslateRequest(req.body);
    const translation = await translateChineseToFrench(text);

    res.json({ translation });
  } catch (error) {
    if (error instanceof TranslateRequestError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }

    console.error("Translation API error:", error);

    if (error instanceof Error && error.message === "GEMINI_API_KEY is missing") {
      res.status(503).json({ error: "Translation service is not configured." });
      return;
    }

    res.status(502).json({ error: "Translation failed." });
  }
});

if (isProduction) {
  const distPath = path.resolve(rootDir, "dist");

  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    appType: "spa",
    server: {
      host,
      middlewareMode: true,
      hmr: process.env.DISABLE_HMR !== "true",
    },
  });

  app.use(vite.middlewares);
}

app.listen(port, host, () => {
  console.log(`Transcribe Easy listening on http://${host}:${port}`);
});
