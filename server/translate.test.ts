import test from "node:test";
import assert from "node:assert/strict";

import {
  TRANSLATION_MAX_CHARS,
  TranslateRequestError,
  buildTranslationPrompt,
  parseTranslateRequest,
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

test("buildTranslationPrompt keeps the instruction and payload together", () => {
  assert.match(
    buildTranslationPrompt("你好，世界"),
    /Only provide the translation, no extra commentary\./,
  );
  assert.match(buildTranslationPrompt("你好，世界"), /Text: 你好，世界/);
});
