import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MODEL,
  OPENROUTER_FAST_FREE_TRANSLATION_MODELS,
  OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND,
  OPENROUTER_TRANSLATION_TIMEOUT_MS,
  TRANSLATION_MAX_CHARS,
  TranslateRequestError,
  buildOpenRouterTranslationRequestBodies,
  buildOpenRouterTranslationRequestBody,
  buildTranslationPrompt,
  getOpenRouterPaidApiKey,
  parseTranslationLanguages,
  parseTranslateRequest,
  resolveTranslationTier,
  stripReasoningBlocks,
} from "./translate";

test("parseTranslateRequest trims valid text", () => {
  assert.equal(parseTranslateRequest({ text: "  你好  " }), "你好");
});

test("parseTranslateRequest rejects missing text", () => {
  assert.throws(
    () => parseTranslateRequest({}),
    (error: unknown) =>
      error instanceof TranslateRequestError &&
      error.statusCode === 400 &&
      error.message === "Text is required.",
  );
});

test("parseTranslateRequest rejects overly long text", () => {
  assert.throws(
    () => parseTranslateRequest({ text: "你".repeat(TRANSLATION_MAX_CHARS + 1) }),
    (error: unknown) =>
      error instanceof TranslateRequestError &&
      error.statusCode === 413 &&
      error.message === "Text is too long.",
  );
});

test("parseTranslationLanguages supports Turkish locale and language name", () => {
  assert.deepEqual(
    parseTranslationLanguages("tr-TR", "Turkish"),
    {
      sourceLang: "Turkish",
      targetLang: "Turkish",
    },
  );
});

test("parseTranslationLanguages supports Chinese meeting labels", () => {
  assert.deepEqual(parseTranslationLanguages("zh-TW", "French"), {
    sourceLang: "Chinese / Taiwan",
    targetLang: "French",
  });
  assert.deepEqual(parseTranslationLanguages("Cantonese / Hong Kong", "French"), {
    sourceLang: "Cantonese / Hong Kong",
    targetLang: "French",
  });
});

test("buildTranslationPrompt keeps the instruction and payload together", () => {
  assert.match(
    buildTranslationPrompt("你好，世界"),
    /Only provide the translation, no extra commentary, no markdown, no analysis/,
  );
  assert.match(buildTranslationPrompt("你好，世界"), /Text: 你好，世界/);
});

test("stripReasoningBlocks removes leaked thought tags from provider output", () => {
  assert.equal(
    stripReasoningBlocks("<thought>analysis here</thought>Que la paix soit avec vous."),
    "Que la paix soit avec vous.",
  );
  assert.equal(
    stripReasoningBlocks("<think>reasoning</think>Bonjour"),
    "Bonjour",
  );
});

test("buildOpenRouterTranslationRequestBody targets free fast-throughput model routing", () => {
  const body = buildOpenRouterTranslationRequestBody("السلام عليكم", DEFAULT_MODEL, "Arabic", "French");

  assert.deepEqual(body.models, OPENROUTER_FAST_FREE_TRANSLATION_MODELS.slice(0, 3));
  assert.equal(body.provider.sort.by, "throughput");
  assert.equal(body.provider.sort.partition, "none");
  assert.equal(
    body.provider.preferred_min_throughput.p50,
    OPENROUTER_MIN_THROUGHPUT_TOKENS_PER_SECOND,
  );
  assert.equal("preferredMinThroughput" in body.provider, false);
  assert.equal(body.provider.max_price.prompt, 0);
  assert.equal(body.provider.max_price.completion, 0);
  assert.equal(body.reasoning.effort, "none");
  assert.equal(body.reasoning.exclude, true);
});

test("fast free translation models stay ordered by benchmarked live responsiveness", () => {
  assert.deepEqual([...OPENROUTER_FAST_FREE_TRANSLATION_MODELS], [
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "poolside/laguna-m.1:free",
    "deepseek/deepseek-v4-flash:free",
  ]);
});

test("OpenRouter translation requests time out after 25 seconds", () => {
  assert.equal(OPENROUTER_TRANSLATION_TIMEOUT_MS, 25_000);
});

test("buildOpenRouterTranslationRequestBodies batches fast free models for OpenRouter limits", () => {
  const bodies = buildOpenRouterTranslationRequestBodies("nasilsin", DEFAULT_MODEL, "Turkish", "French");

  assert.deepEqual(
    bodies.flatMap((body) => body.models),
    [...OPENROUTER_FAST_FREE_TRANSLATION_MODELS],
  );
  assert.ok(bodies.every((body) => body.models.length <= 3));
});

test("resolveTranslationTier defaults to free when unset", () => {
  assert.equal(resolveTranslationTier(undefined), "free");
  assert.equal(resolveTranslationTier(""), "free");
});

test("resolveTranslationTier returns paid only for an explicit paid value", () => {
  assert.equal(resolveTranslationTier("paid"), "paid");
  assert.equal(resolveTranslationTier("PAID"), "paid");
  assert.equal(resolveTranslationTier("  Paid  "), "paid");
});

test("resolveTranslationTier treats any non-paid value as free", () => {
  assert.equal(resolveTranslationTier("free"), "free");
  assert.equal(resolveTranslationTier("premium"), "free");
  assert.equal(resolveTranslationTier("true"), "free");
});

function withOpenRouterEnv(
  main: string | undefined,
  paid: string | undefined,
  run: () => void,
): void {
  const original = {
    main: process.env.OPENROUTER_API_KEY,
    paid: process.env.OPENROUTER_PAID_API_KEY,
  };
  const apply = (key: "OPENROUTER_API_KEY" | "OPENROUTER_PAID_API_KEY", value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    apply("OPENROUTER_API_KEY", main);
    apply("OPENROUTER_PAID_API_KEY", paid);
    run();
  } finally {
    apply("OPENROUTER_API_KEY", original.main);
    apply("OPENROUTER_PAID_API_KEY", original.paid);
  }
}

test("getOpenRouterPaidApiKey prefers the dedicated paid key when set", () => {
  withOpenRouterEnv("sk-main", "sk-paid", () => {
    assert.equal(getOpenRouterPaidApiKey(), "sk-paid");
  });
});

test("getOpenRouterPaidApiKey falls back to the main key when no paid key is set", () => {
  withOpenRouterEnv("sk-main", undefined, () => {
    assert.equal(getOpenRouterPaidApiKey(), "sk-main");
  });
});
