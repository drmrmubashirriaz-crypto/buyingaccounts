/**
 * Scripted check for the reported CODM refusal dialogue.
 * Run: npx tsx scripts/check-codm-quote.ts
 *
 * Without OPENAI_API_KEY: exercises rules/heuristic path (must still quote).
 * With key: researchMarketQuote may hit live web search.
 */

import { createFreshChat, runBotTurn } from "../src/lib/bot";
import { researchMarketQuote } from "../src/lib/market-quote";
import { detectPlatform, heuristicMarketQuote } from "../src/lib/pricing";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  // Unit: CODM is detected and never hard-refused by heuristic
  assert(detectPlatform("one level 300 CODM account") === "codm", "detect CODM");
  const h = heuristicMarketQuote({
    platform: "CODM",
    specs: ["Level 300"],
    quantity: 1,
    rawText: "one level 300 CODM account",
  });
  assert(!h.declined, "heuristic must not decline CODM");
  assert(h.priceUsd >= 15, "heuristic price");
  console.log("heuristic CODM quote: $%d — %s", h.priceUsd, h.summary);

  // Market research path (may use OpenAI web search when key present)
  const researched = await researchMarketQuote({
    platform: "CODM",
    specs: ["Level 300"],
    quantity: 1,
    rawText: "one level 300 CODM account",
  });
  assert(!researched.declined, "research must not decline CODM");
  assert(researched.priceUsd >= 15, "research price");
  console.log(
    "research CODM quote: $%d via %s — %s",
    researched.priceUsd,
    researched.researchProvider || "n/a",
    researched.researchBrief || researched.summary
  );
  if (process.env.OPENAI_API_KEY) {
    assert(
      researched.researchProvider === "openai_web",
      "with OPENAI_API_KEY, provider must be openai_web (ChatGPT web search)"
    );
  }

  // Dialogue shaped like the live bug (rules engine when no key)
  const chat = createFreshChat();
  // Seed draft as if bot already confirmed "one level 300 CODM"
  chat.phase = "qualifying";
  chat.draft = {
    platform: "codm",
    specs: ["Level 300"],
    quantity: 1,
    notes: "one level 300 CODM account",
  };

  const turn = await runBotTurn(chat, "yes");
  const reply = turn.streamedReply || "";
  console.log("dialogue reply (%s): %s", turn.engine, reply.slice(0, 280));

  assert(turn.chat.quote, "expected a quote after yes");
  assert(turn.chat.quote!.priceUsd >= 15, "quoted price");
  assert(
    !/can'?t quote|cannot quote|another platform/i.test(reply),
    "must not refuse CODM"
  );
  assert(/\$\d+/.test(reply), "reply must include $ price");
  assert(turn.chat.phase === "quoted", "phase quoted");

  console.log("OK — CODM quote path passes");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
