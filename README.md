# BuyingAccounts — chat marketplace (v2.1)

Chat-first web app for **buyingaccounts.com**. Buyers talk to a human-feeling seller bot, get a **fixed** crypto quote from pricing rules (the LLM never invents prices), pay via Suby, then leave a delivery email for manual fulfillment.

## What’s new in v2.1

- **Honest Live LLM mode**: if `OPENAI_API_KEY` is set, OpenAI is used; failures show in chat + **LLM error** badge (no silent Rules fallback)
- **`GET /api/chat/status`** → `{ mode, hasKey, model }` for an accurate header badge
- Robust `.env.local` key parsing (BOM / quotes / CRLF)
- Smalltalk (“hi”) no longer dumps a stale keyword quote

### v2

- OpenAI seller brain + tool calls into `pricing.ts`
- Streaming UX via `/api/chat/stream`
- Enhanced rules when no API key
- Deterministic prices only via `get_fixed_quote`

## Run locally

```bash
cd buyingaccounts-web
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Admin: [http://localhost:3000/admin](http://localhost:3000/admin) — set a strong `ADMIN_KEY` in `.env.local` first.

### Windows — set OpenAI key

```bat
cd buyingaccounts-web
copy .env.example .env.local
notepad .env.local
```

In Notepad set:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o-mini
```

Save, then `npm install` and `npm run dev`. PowerShell alternative: `Copy-Item .env.example .env.local`.

Without a key the app still runs on the enhanced rule engine.

Verify the server sees your key:

```bash
curl http://localhost:3000/api/chat/status
# expect: {"mode":"llm","hasKey":true,"model":"gpt-4o-mini"}
```

If `hasKey` is false, restart `npm run dev` after editing `.env.local` (must be in the `buyingaccounts-web` folder).

## Demo flow

1. Land on `/` — chat is the product.
2. Talk naturally (e.g. “looking for an old Twitter, like 2009”).
3. Bot clarifies if needed, then quotes a **fixed USD** price from rules.
4. Say yes → mock Suby link in chat (progressive reply).
5. Pay (or **Mock: mark paid**) → enter delivery email → **sourcing**.
6. `/admin` → mark **delivered**.

## Env vars

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | Enables live LLM seller. Empty → enhanced rules. |
| `OPENAI_MODEL` | Default `gpt-4o-mini` |
| `SUBY_API_KEY` / `SUBY_MOCK` | Crypto checkout; mock when empty or `SUBY_MOCK=true` |
| `SUBY_WEBHOOK_SECRET` | Required for `/api/payments/webhook` (no default) |
| `NEXT_PUBLIC_APP_URL` | Checkout link base |
| `ADMIN_KEY` | Required for admin API/UI (no default) |
| `TELEGRAM_*` / `ALERT_EMAIL_*` | Optional paid-order alert stubs |

## Mocked vs real

| Piece | Behavior |
|-------|----------|
| Bot | **LLM** with tools if key set; else **enhanced rules** |
| Pricing | **Always** `src/lib/pricing.ts` (LLM cannot invent $) |
| Suby | Mock `/pay/[id]` → `/api/payments/mock-complete`; real Suby uses signed `/api/payments/webhook` |
| Store | JSON `data/store.json` |
| Alerts / fulfillment | Stub alerts; manual admin |

## Key routes

- `GET/POST /api/chat` — session + non-stream turn
- `POST /api/chat/stream` — SSE progressive reply
- `POST /api/payments/webhook` — payment confirmation
- `GET/PATCH /api/admin/orders` — operator inbox

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · OpenAI tools · JSON store
