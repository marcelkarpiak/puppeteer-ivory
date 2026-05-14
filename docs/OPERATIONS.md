# Operations

## Uruchamianie

### Ręcznie (zalecane przy developmencie)

```bash
# Terminal 1: bot
node fb-bot.js

# Terminal 2: frontend
cd frontend && npm run dev
```

### Skrypt startowy

```bash
./start-system.sh   # Uruchamia fb-bot.js + frontend w osobnych oknach Terminal.app
```

## Zarządzanie kontami

```bash
./manage-accounts.sh status   # Status kont (cookies, cache size, learning data)
./manage-accounts.sh test     # Test bota
./manage-accounts.sh clean    # Czyszczenie cache/profili
```

## Monitoring

### Heartbeat
Bot wysyła heartbeat co 60s do tabeli `bot_instances`:
- `status: 'online' / 'offline'`
- `last_heartbeat` (timestamp)
- `posts_today` (licznik)

W dashboardzie strona `/bots` pokazuje status na żywo.

### Alerty
Bot loguje alerty do tabeli `alerts`:
- `checkpoint` — wykryto ekran weryfikacji FB (wymaga ręcznej akcji)
- `pattern_risk` — wysoki wynik ryzyka bana
- `error` — błędy systemowe
- `bot_offline` — brak heartbeatu > 5 min

Sidebar dashboard pokazuje licznik nowych alertów (realtime).

### Risk Prediction
Po każdej sesji `risk-prediction.js` oblicza wynik na bazie:
- Liczby przetworzonych postów
- Czasu trwania sesji
- Prędkości akcji
- Wzorców z `behavioral-learning.js`

Wynik > `high` / `critical` → automatyczny alert.

## Co robić gdy bot zostanie zablokowany

### Checkpoint Facebook
1. W dashboardzie zobaczysz alert typu `checkpoint`
2. Otwórz `accounts/main-account/browser-profile/` lokalnie:
   ```bash
   node -e "require('puppeteer').launch({ headless: false, userDataDir: './accounts/main-account/browser-profile' })"
   ```
3. Przejdź weryfikację Facebooka ręcznie
4. Bot będzie czekał 24h zanim wznowi (`session-cooldown`)

### Wysokie ryzyko
- Sprawdź `pattern_risk` w alertach
- Zwiększ `intervalMinutes.min` w `config/scraper.json`
- Skróć `activeHours` (mniejsze okno czasowe)

### Bot całkowicie zbanowany
- Usuń `accounts/main-account/browser-profile/`
- Załóż nowe konto FB
- Wykonaj pierwsze logowanie ręcznie (patrz [SETUP.md](SETUP.md))

## Troubleshooting

### "Browser lock already held"
Inna instancja używa profilu Chrome. Sprawdź:
```bash
ls accounts/main-account/browser-profile/.lock
ps aux | grep chrome
```
Jeśli proces nie żyje, usuń lock:
```bash
rm accounts/main-account/browser-profile/.lock
```

### "Brak aktywnych grup w bazie"
Dodaj grupy w dashboardzie (`/groups`). Bot pomija sesję jeśli nie ma grup.

### Screenshot fails
Post zostanie zapisany z `status: 'new'` i `screenshot_url: null`. Dashboard pokaże go w alertach.

### Frontend nie widzi nowych postów
Sprawdź subskrypcję Realtime — w Supabase dashboard → Database → Replication → włącz dla tabeli `posts`.

## Distributed (wiele instancji)

`distributed-coordinator.js` używa pliku `shared-state/shared-state.json` do koordynacji wielu botów. Konfiguracja w `config/scraper.json`:

```json
"distributed": {
    "maxInstances": 5,
    "loadBalancingStrategy": "round_robin",
    "instanceTimeout": 120000,
    "sharedStatePath": "./shared-state"
}
```

Każda instancja sama wybiera grupy do skanowania — koordynator zapobiega podwójnemu skanowaniu tej samej grupy.

## Bezpieczeństwo

- **Supabase Auth** — logowanie emailem
- **RLS** — izolacja danych per `user_id`
- **Service Role Key** — bot omija RLS (zapisuje posty dla dowolnego usera)
- **Middleware Next.js** — ochrona tras + role check
- **Browser Lock** — zapobiega równoczesnej pracy dwóch instancji na jednym profilu
- **puppeteer-extra-plugin-stealth** — ukrywanie automatyzacji
- **Brak `--single-process` / `--no-zygote`** — usunięte flagi typowe dla Dockera/botów
