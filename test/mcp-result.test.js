import assert from "node:assert/strict";
import test from "node:test";
import { textResult } from "../server/mcp-result.js";

test("textResult preserves strings", () => {
  assert.deepEqual(textResult("Done"), { content: [{ type: "text", text: "Done" }] });
});

test("textResult formats structured values as readable JSON", () => {
  assert.equal(textResult({ ok: true }).content[0].text, '{\n  "ok": true\n}');
});
