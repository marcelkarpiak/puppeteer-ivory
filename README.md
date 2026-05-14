# IvoryLab FB Scraper

System monitorowania grup Facebook pod kątem lead generation dla usług IvoryLab (voiceboty, chatboty, automatyzacje, custom software, AI).

## Co to jest

Bot Puppeteer skanuje wybrane grupy Facebook, dopasowuje posty do słów kluczowych zarządzanych przez dashboard, zapisuje dane + screenshoty w Supabase. Dashboard Next.js służy do konfiguracji (grupy, słowa, kategorie) i przeglądu znalezisk.

## Architektura

```
fb-bot.js  ──►  Supabase (DB + Storage + Auth)  ◄──  Frontend (Next.js dashboard)
```

Bot i frontend są **niezależne** — komunikują się tylko przez Supabase.

## Quick start

```bash
npm install
cd frontend && npm install && cd ..
cp .env.example .env       # wypełnij dane Supabase

node fb-bot.js             # pierwsze uruchomienie — zaloguj się ręcznie do FB
cd frontend && npm run dev # dashboard na http://localhost:3000
```

Pełne instrukcje:
- **[docs/SETUP.md](docs/SETUP.md)** — instalacja, env vars, pierwsze logowanie do FB
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — moduły, dataflow, schemat bazy, mechanizmy anty-detekcji
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — uruchamianie, monitoring, troubleshooting

## Stack

- **Bot:** Node.js, Puppeteer + stealth, Supabase JS
- **Frontend:** Next.js 16, React 19, Tailwind 4, shadcn/ui, Supabase Auth
- **Backend:** Supabase (PostgreSQL + Storage + Realtime + Auth)
