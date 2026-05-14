# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IvoryLab Facebook group monitoring system for lead generation (voicebots, chatbots, automation, custom software, AI services). A Puppeteer bot scrapes Facebook groups for keyword-matched posts, takes screenshots, and stores data in Supabase. A Next.js dashboard provides CRUD management of groups, keywords, categories, and bot monitoring.

Full docs in `docs/` (ARCHITECTURE, SETUP, OPERATIONS).

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

**1. Bot (`fb-bot.js`)** — Node.js process using `puppeteer-real-browser` (fixes CDP Runtime.Enable leak, replaces puppeteer-extra + stealth plugin).
- Runs in a `while(true)` loop: session manager controls timing (active hours, working days, break-in ramp-up)
- Each session: acquire browser lock → `connect()` Chrome with shared profile (`userDataDir`) → warmup on facebook.com → navigate to 1-2 random groups → scan feed → keyword match → screenshot + upload → save to Supabase → cooldown → release lock
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
| `account-manager.js` | Loads account configs from `accounts/*/config.json`, provides `getChromePath()`, `getBrowserOptions()` — used to extract `userDataDir` for `connect()` |
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

Schema in `supabase/setup_complete.sql`. Key tables: `posts`, `groups`, `keywords`, `categories`, `alerts`, `bot_instances`, `user_profiles`, `processed_posts`. All tables have RLS enabled — bot uses service role key, dashboard uses anon key with auth.

Triggers auto-create `user_profiles` on auth signup. Default categories (Voiceboty, Chatboty, Automatyzacje, Custom Software) are inserted manually via Supabase dashboard or SQL — the trigger seeds different values depending on project setup.

Screenshots stored in Supabase Storage bucket `screenshots` (public).

### Data Flow

1. Bot fetches active groups + keywords from Supabase. If empty, session is skipped with a warning — there is no JSON fallback (configure via dashboard).
2. For each post: extract content → `matchKeywords()` → if matched: expand post → `postHandle.screenshot()` → upload to Supabase Storage → save post with `status: 'done'` and `screenshot_url`
3. If screenshot fails: post saved with `status: 'new'`, `screenshot_url: null`
4. Bot registers itself in `bot_instances`, sends heartbeat every 60s

## Environment Variables

**Bot (`.env` in root):**
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred for bot — bypasses RLS)
- `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback)

**Frontend (`frontend/.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Critical Patterns

- **No JSON cookies**: Bot uses `userDataDir` for Chrome profile persistence (SQLite-based). There are no `saveCookies`/`loadCookies` functions. First-time login must be done manually by opening Chrome with the same `--user-data-dir` and logging into Facebook.
- **`puppeteer-real-browser` not `puppeteer-extra`**: Browser is launched via `connect({ customConfig, args, connectOption })`, not `puppeteer.launch()`. This fixes the CDP `Runtime.Enable` leak detected by anti-bot systems since mid-2024. Do not re-introduce `puppeteer-extra` or `puppeteer-extra-plugin-stealth`.
- **`defaultViewport: null`**: Chrome manages its own viewport via `--start-maximized`. Never set viewport dimensions. `page.viewport()` returns `null` — use `window.innerWidth` / `window.innerHeight` via `page.evaluate()` when window size is needed (see `humanMouseMove` in `human-behavior.js`).
- **Fingerprint philosophy**: `device-fingerprint.js` does NOT override hardware values (CPU, RAM, screen, WebGL). Only timezone, language, platform, and CDP evasion markers. Overriding hardware creates detectable inconsistencies.
- **Variable scoping in sessions**: `page` and `browserLock` must be declared before the try block in `runSingleSession()` so they're accessible in the `finally` block for cleanup.
- **Social interactions on keyword posts**: NEVER. `social-interactions.js` budget applies only to non-keyword-matched posts.
- **Bot module export**: `fb-bot.js` exports `{ runSingleSession }` at the bottom for use by `distributed-coordinator.js`.

## Account Configuration

Accounts live in `accounts/<name>/config.json` with type `main`. The `AccountManager` class discovers them automatically. Each account has isolated paths for browser profile, cache, learning data, screenshots, and logs.

## Config Files

`config/scraper.json` contains ONLY safety/timing settings (active hours, intervals, fault tolerance, distributed coordinator). Groups, keywords, and categories are managed exclusively through the Supabase dashboard — there is no `config/keywords.json`.
