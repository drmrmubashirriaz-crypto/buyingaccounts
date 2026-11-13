/**
 * Scripted check for the reported CODM refusal dialogue.
 * Run: npx tsx scripts/check-codm-quote.ts
 *
 * Without OPENAI_API_KEY: exercises rules/heuristic path (must still quote).
 * With key: researchMarketQuote may hit live web search.
 */

import { createFreshChat, runBotTurn } from "../src/lib/bot";
import {
  looksLikePlatformSwap,
  looksLikePricingRefusal,
} from "../src/lib/llm";
import { researchMarketQuote } from "../src/lib/market-quote";
import { detectPlatform, heuristicMarketQuote } from "../src/lib/pricing";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const bad =
    "Looks like I don't have pricing for CODM right now. Can you pick another platform like Discord, Fortnite, or Steam?";
  assert(looksLikePricingRefusal(bad), "detect live refusal copy");
  assert(
    !looksLikePricingRefusal(
      "Yep — that CODM account is available. Fixed price is $130 USD."
    ),
    "good quote is not a refusal"
  );

  const gmailSwap =
    "I can't provide Gmail accounts, but that Twitter account is still available for $150. Just say yes to proceed with the Suby crypto checkout!";
  assert(looksLikePricingRefusal(gmailSwap), "detect Gmail can't-provide refusal");
  assert(
    looksLikePlatformSwap(gmailSwap, "gmail"),
    "detect Gmail→Twitter platform swap"
  );
  assert(detectPlatform("I need a Gmail account") === "gmail", "detect Gmail");
  const gmailH = heuristicMarketQuote({
    platform: "gmail",
    specs: ["Standard account matching your description"],
    quantity: 1,
    rawText: "gmail account",
  });
  assert(!gmailH.declined, "heuristic must not decline Gmail");
  assert(gmailH.priceUsd >= 15, "gmail heuristic price");
  console.log("heuristic Gmail quote: $%d — %s", gmailH.priceUsd, gmailH.summary);

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
  const chat = createFreshChat("test-viewer");
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
    !/can'?t quote|cannot quote|another platform|don'?t have pricing/i.test(
      reply
    ),
    "must not refuse CODM"
  );
  assert(/\$\d+/.test(reply), "reply must include $ price");
  assert(/available/i.test(reply), "must say available");
  assert(turn.chat.phase === "quoted", "phase quoted");

  console.log("OK — CODM quote path passes");
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
