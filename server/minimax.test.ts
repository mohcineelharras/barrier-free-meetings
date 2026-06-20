import assert from "node:assert/strict";
import test from "node:test";

import { MINIMAX_TIMEOUT_MS } from "./minimax";

test("MiniMax translation requests time out after 25 seconds", () => {
  assert.equal(MINIMAX_TIMEOUT_MS, 25_000);
});
