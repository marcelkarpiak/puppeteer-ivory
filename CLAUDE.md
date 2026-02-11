# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Facebook group monitoring system: a Puppeteer bot scrapes Facebook groups for keyword-matched posts, takes screenshots, stores data in Supabase, and sends webhooks to n8n. A Next.js dashboard provides CRUD management of groups, keywords, categories, and bot monitoring.

## Commands

### Bot (root directory)
```bash
npm install                  # Install bot dependencies
node fb-bot.js               # Run the main bot (long-running process)
node test-stealth.js         # Test browser stealth/fingerprint
node test-system-chrome.js   # Test Chrome detection
```

### Frontend Dashboard (frontend/)
```bash
cd frontend && npm install   # Install frontend dependencies
npm run dev --prefix frontend  # Dev server (or `npm run dev` from root)
npm run build --prefix frontend  # Production build
npm run lint --prefix frontend   # ESLint
```

## Architecture

### Two Independent Systems

**1. Bot (`fb-bot.js`)** — Node.js process using puppeteer-extra with stealth plugin.
- Runs in a `while(true)` loop: session manager controls timing (active hours, working days, break-in ramp-up)
- Each session: acquire browser lock → launch Chrome with shared profile (`userDataDir`) → warmup on facebook.com → navigate to 1-2 random groups → scan feed → keyword match → screenshot + upload → save to Supabase → cooldown → release lock
- Uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS (falls back to anon key with warning)
- Exports `runSingleSession()` for the distributed coordinator

**2. Dashboard (`frontend/`)** — Next.js 16 + React 19, Tailwind 4, shadcn/ui (Radix), Supabase Auth.
- Route groups: `(auth)/login` and `(dashboard)/` with pages for groups, keywords, categories, alerts, bots, admin
- Middleware enforces auth (redirect to `/login`) and admin-only routes (`/admin`, `/categories`)
- Two roles: `admin` (full CRUD) and `user` (read-only) via `user_profiles.role`
- Supabase client: `lib/supabase-browser.ts` (client), `lib/supabase-server.ts` (server components)

### Bot Lib Modules (lib/)

| Module | Purpose |
|--------|---------|
| `account-manager.js` | Loads account configs from `accounts/*/config.json`, provides `getChromePath()`, `getBrowserOptions()` with `defaultViewport: null` + `--start-maximized` |
| `browser-lock.js` | File-based lock preventing concurrent Chrome profile access (PID-checked, auto-cleanup) |
| `session-manager.js` | Active hours, working days, peak hours scheduling |
| `session-warmup.js` | Pre-scan warmup: browse newsfeed, check notifications (also verifies login status) |
| `session-cooldown.js` | Post-scan cooldown behavior |
| `device-fingerprint.js` | Only overrides timezone/language/platform + CDP evasion. Hardware (CPU, RAM, screen, WebGL) comes from real Chrome |
| `social-interactions.js` | Session-budgeted reactions/abandoned comments (65% of sessions = zero interactions). Never on keyword-matched posts |
| `break-in-manager.js` | Gradual activity ramp-up during first week |
| `stateful-scanner.js` | Deduplication via Supabase `processed_posts` table |
| `human-behavior.js` | Core delays, scrolling, clicking, ban detection, checkpoint handling |
| `human-idle-behaviors.js` | Mouse movements, random scrolls, tab switches between posts |
| `human-error-simulation.js` | Misclicks, typos, over-scrolling |
| `behavioral-learning.js` | Records session actions for pattern analysis |
| `risk-prediction.js` | Calculates detection risk score per session |
| `fault-tolerance.js` | Retry with circuit breaker for flaky operations |
| `distributed-coordinator.js` | Multi-instance coordination (shared-state directory) |
| `cache-manager.js` | Local file-based cache for post deduplication |

### Database (Supabase)

Schema in `supabase/schema.sql`. Key tables: `posts`, `groups`, `keywords`, `categories`, `alerts`, `bot_instances`, `user_profiles`, `scraper_sessions`. All tables have RLS enabled — bot uses service role key, dashboard uses anon key with auth.

Triggers auto-create `user_profiles` on auth signup and seed default categories.

Screenshots stored in Supabase Storage bucket `screenshots` (public).

### Data Flow

1. Bot fetches active groups + keywords from Supabase (falls back to `config/scraper.json` + `config/keywords.json`)
2. For each post: extract content → `matchKeywords()` → if matched: expand post → `postHandle.screenshot()` → upload to Supabase Storage → save post with `status: 'done'` and `screenshot_url`
3. If screenshot fails: post saved with `status: 'new'`, `screenshot_url: null`
4. Also sends to n8n webhook (optional)
5. Bot registers itself in `bot_instances`, sends heartbeat every 60s

## Environment Variables

**Bot (`.env` in root):**
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for bot — bypasses RLS)
- `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback)

**Frontend (`frontend/.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Critical Patterns

- **No JSON cookies**: Bot uses `userDataDir` for Chrome profile persistence (SQLite-based). There are no `saveCookies`/`loadCookies` functions.
- **`defaultViewport: null`**: Chrome manages its own viewport via `--start-maximized`. Never set viewport dimensions in Puppeteer options.
- **Fingerprint philosophy**: `device-fingerprint.js` does NOT override hardware values (CPU, RAM, screen, WebGL). Only timezone, language, platform, and CDP evasion markers. Overriding hardware creates detectable inconsistencies.
- **Variable scoping in sessions**: `page` and `browserLock` must be declared before the try block in `runSingleSession()` so they're accessible in the `finally` block for cleanup.
- **Social interactions on keyword posts**: NEVER. `social-interactions.js` budget applies only to non-keyword-matched posts.
- **Bot module export**: `fb-bot.js` exports `{ runSingleSession }` at the bottom for use by `distributed-coordinator.js`.

## Account Configuration

Accounts live in `accounts/<name>/config.json` with type `main`/`scanner`/`screenshot`. The `AccountManager` class discovers them automatically. Each account has isolated paths for browser profile, cache, learning data, screenshots, and logs.
