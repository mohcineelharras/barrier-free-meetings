import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_AI_TRANSLATION_TIMEOUT_MS,
  fetchGoogleAIModels,
  isGoogleAITranslationModel,
  translateWithGoogleAI,
} from "./googleai";

const originalFetch = globalThis.fetch;
const originalGoogleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;

  if (originalGoogleApiKey === undefined) {
    delete process.env.GOOGLE_AI_STUDIO_API_KEY;
  } else {
    process.env.GOOGLE_AI_STUDIO_API_KEY = originalGoogleApiKey;
  }
});

test("isGoogleAITranslationModel keeps text chat models and drops image/media models", () => {
  assert.equal(isGoogleAITranslationModel("gemini-2.5-flash", "Gemini 2.5 Flash"), true);
  assert.equal(isGoogleAITranslationModel("gemma-4-26b-a4b-it", "Gemma 4 26B A4B"), true);
  assert.equal(isGoogleAITranslationModel("gemini-3-pro-image", "Nano Banana Pro"), false);
  assert.equal(isGoogleAITranslationModel("gemini-2.5-flash-image", "Nano Banana"), false);
  assert.equal(isGoogleAITranslationModel("gemini-2.5-flash-preview-tts", "Gemini 2.5 Flash Preview TTS"), false);
  assert.equal(isGoogleAITranslationModel("veo-3.0-generate-001", "Veo 3"), false);
  assert.equal(isGoogleAITranslationModel("text-embedding-004", "Text Embedding 004"), false);
});

test("fetchGoogleAIModels maps Gemini REST models to selectable text models", async () => {
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  globalThis.fetch = (async (input) => {
    assert.equal(
      input,
      "https://generativelanguage.googleapis.com/v1beta/models?key=test-key",
    );

    return new Response(
      JSON.stringify({
        models: [
          {
            name: "models/gemini-2.5-flash-preview-04-17",
            baseModelId: "gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent", "countTokens"],
          },
          {
            name: "models/gemini-2.5-flash-preview-05-20",
            baseModelId: "gemini-2.5-flash",
            displayName: "Gemini 2.5 Flash",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-3-pro-image",
            baseModelId: "gemini-3-pro-image",
            displayName: "Nano Banana Pro",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemini-2.5-flash-image",
            baseModelId: "gemini-2.5-flash-image",
            displayName: "Nano Banana",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/gemma-4-26b-a4b-it",
            baseModelId: "gemma-4-26b-a4b-it",
            displayName: "Gemma 4 26B A4B",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/text-embedding-004",
            baseModelId: "text-embedding-004",
            displayName: "Text Embedding 004",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const models = await fetchGoogleAIModels();

  assert.deepEqual(models, [
    {
      id: "gemini-2.5-flash",
      name: "Gemini 2.5 Flash",
    },
    {
      id: "gemma-4-26b-a4b-it",
      name: "Gemma 4 26B A4B",
    },
  ]);
});

test("fetchGoogleAIModels throws when Google AI Studio is not configured", async () => {
  delete process.env.GOOGLE_AI_STUDIO_API_KEY;

  await assert.rejects(
    () => fetchGoogleAIModels(),
    /GOOGLE_AI_STUDIO_API_KEY is missing/,
  );
});

test("fetchGoogleAIModels surfaces upstream failures", async () => {
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  globalThis.fetch = (async () =>
    new Response("upstream unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    })) as typeof fetch;

  await assert.rejects(
    () => fetchGoogleAIModels(),
    /Failed to load Google AI Studio models \(503\)/,
  );
});

test("Google AI Studio translation requests time out after 25 seconds", () => {
  assert.equal(GOOGLE_AI_TRANSLATION_TIMEOUT_MS, 25_000);
});

test("translateWithGoogleAI strips leaked thought blocks", async () => {
  process.env.GOOGLE_AI_STUDIO_API_KEY = "test-key";
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      reasoning_effort?: string;
      messages?: Array<{ content: string }>;
    };

    assert.equal(body.reasoning_effort, undefined);
    assert.match(body.messages?.[0]?.content ?? "", /no <think> or <thought> tags/);

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: "<thought>Do a long analysis.</thought>Que la paix soit avec vous.",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  const translation = await translateWithGoogleAI(
    "السلام عليكم",
    "gemma-4-26b-a4b-it",
    "Arabic",
    "French",
  );

  assert.equal(translation, "Que la paix soit avec vous.");
});
