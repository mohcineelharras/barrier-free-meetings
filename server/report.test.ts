import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportPrompt,
  buildSparseReport,
  fitTranscriptToBudget,
  generateReport,
  shouldUseSparseReportFallback,
} from "./report";

test("shouldUseSparseReportFallback detects very short conversational snippets", () => {
  assert.equal(
    shouldUseSparseReportFallback([
      { original: "السلام عليكم", translated: "La paix soit avec vous." },
      { original: "كيف الحال", translated: "Comment ça va ?" },
    ]),
    true,
  );
});

test("buildSparseReport stays grounded for greeting-only transcripts", () => {
  const report = buildSparseReport(
    [
      { original: "السلام عليكم", translated: "La paix soit avec vous." },
      { original: "كيف الحال", translated: "Comment ça va ?" },
    ],
    "Arabic",
    "French",
    "French",
  );

  assert.match(report, /## Summary/);
  assert.match(report, /Bref échange de salutations/i);
  assert.match(report, /None identified/);
  assert.doesNotMatch(report, /Marie Dupont|Jean Martin|project|delivery/i);
});

test("buildReportPrompt forbids invented meeting details", () => {
  const prompt = buildReportPrompt(
    [{ original: "Status is good", translated: "Le statut est bon" }],
    "English",
    "French",
    "French",
  );

  assert.match(prompt, /Do NOT invent participants, names, decisions, dates, actions, or project details/i);
  assert.match(prompt, /If the transcript is sparse, ambiguous, or only contains greetings/i);
});

test("fitTranscriptToBudget returns the transcript unchanged when it fits", () => {
  const lines = ["1. hello", "2. world"];

  assert.equal(fitTranscriptToBudget(lines, 1_000), "1. hello\n\n2. world");
});

test("fitTranscriptToBudget keeps the opening and closing and drops the middle", () => {
  const lines = Array.from({ length: 200 }, (_, i) => `${i + 1}. ${"x".repeat(40)}`);

  const fitted = fitTranscriptToBudget(lines, 600);

  assert.ok(fitted.length <= 600, `expected <= 600 chars, got ${fitted.length}`);
  assert.match(fitted, /omitted to fit the model context limit/);
  assert.ok(fitted.includes("1. "), "should keep the first line");
  assert.ok(fitted.includes("200. "), "should keep the last line");
  assert.ok(!fitted.includes("100. "), "should drop a middle line");
});

test("buildReportPrompt truncates an overlong transcript before prompting", () => {
  const segments = Array.from({ length: 5_000 }, (_, i) => ({
    original: `Original sentence number ${i} with some filler text.`,
    translated: `Phrase traduite numéro ${i} avec du texte de remplissage.`,
  }));

  const prompt = buildReportPrompt(segments, "English", "French", "French");

  assert.match(prompt, /middle of the transcript omitted/);
  // Prompt = fixed instructions + budgeted transcript; stays well under the model limit.
  assert.ok(prompt.length < 20_000, `expected bounded prompt, got ${prompt.length}`);
});

test("generateReport chunks long transcripts before synthesizing the final report", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const selectedModel = "inclusionai/ling-3.0-flash:free";
  const prompts: string[] = [];

  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      messages?: Array<{ content?: string }>;
    };
    const prompt = body.messages?.[0]?.content ?? "";
    prompts.push(prompt);

    const content = prompt.includes("CHUNK NOTES")
      ? "## Summary\nFinal synthesized report."
      : "Chunk note: discussed accessibility, setup reliability, and reports.";

    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const segments = Array.from({ length: 420 }, (_, i) => ({
      original: `Original sentence ${i}. ${"The team discussed reliable onboarding and meeting notes. ".repeat(4)}`,
      translated: `Phrase traduite ${i}. ${"L'équipe a discuté de l'intégration fiable et des comptes rendus. ".repeat(4)}`,
    }));

    const report = await generateReport(
      segments,
      "English",
      "French",
      "French",
      "openrouter",
      selectedModel,
    );

    assert.equal(report, "## Summary\nFinal synthesized report.");
    assert.ok(prompts.length > 1, `expected chunk prompts plus final prompt, got ${prompts.length}`);
    assert.match(prompts[0], /Transcript chunk 1/i);
    assert.doesNotMatch(prompts[0], /middle of the transcript omitted/i);
    assert.match(prompts.at(-1) ?? "", /CHUNK NOTES/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }
});

test("generateReport still calls the selected OpenRouter model for short transcripts", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const selectedModel = "inclusionai/ling-3.0-flash:free";
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

  process.env.OPENROUTER_API_KEY = "test-openrouter-key";
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "## Summary\nBrief exchange." } }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }) as typeof fetch;

  try {
    const report = await generateReport(
      [
        { original: "السلام عليكم", translated: "Bonjour" },
        { original: "كيف الحال", translated: "Comment ca va ?" },
      ],
      "Arabic",
      "French",
      "French",
      "openrouter",
      selectedModel,
    );

    assert.equal(report, "## Summary\nBrief exchange.");
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0]?.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(fetchCalls[0]?.body.model, selectedModel);
    assert.equal(fetchCalls[0]?.body.max_tokens, 768);
    assert.deepEqual(fetchCalls[0]?.body.reasoning, {
      effort: "none",
      exclude: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
  }
});
