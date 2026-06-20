import test from "node:test";
import assert from "node:assert/strict";
import { buildLanguageVerificationPrompt } from "./languageVerification";

test("buildLanguageVerificationPrompt contains the expected structure", () => {
  const text = "Bonjour, comment ça va?";
  const prompt = buildLanguageVerificationPrompt(text, "French");

  assert.match(prompt, /Bonjour, comment ça va\?/);
  assert.match(prompt, /"French"/);
  assert.match(prompt, /Answer with exactly "yes" or "no"/);
});
