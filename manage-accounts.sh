#!/bin/bash

# 🔧 Manage Accounts Script z Browser Isolation
# Zarządzanie kontami Facebooka z pełną separacją przeglądarek

echo "🔧 Facebook Bot - Account Manager (Browser Isolation)"
echo "================================================="

PROJECT_ROOT="$(pwd)"
cd "$PROJECT_ROOT"

case "$1" in
    "status")
        echo "📊 Status kont:"
        node -e "
const AccountManager = require('./lib/account-manager');
const manager = new AccountManager();
const report = manager.generateAccountReport();
console.log('Total accounts:', report.totalAccounts);
console.log('Active accounts:', report.activeAccounts);
console.log('');
report.accounts.forEach(acc => {
    console.log(\`📁 \${acc.name} (\${acc.type})\`);
    console.log(\`   Email: \${acc.email}\`);
    console.log(\`   Status: \${acc.status}\`);
    console.log(\`   Cookies: \${acc.hasCookies ? '✅' : '❌'}\`);
    console.log(\`   Cache: \${acc.cacheSize} bytes\`);
    console.log(\`   Learning: \${acc.learningSize} bytes\`);
    console.log(\`   Browser Profile: \${acc.browserProfileSize} bytes\`);
    console.log(\`   Profile Path: \${acc.browserProfile}\`);
    console.log('');
});
"
        ;;
    
    "list")
        echo "📋 Lista kont:"
        ls -la accounts/
        echo ""
        echo "🌐 Browser profiles:"
        find accounts/ -name "browser-profile" -type d
        ;;
    
    "setup")
        echo "🔧 Setup:"
        echo ""
        echo "1. Zaloguj się na konto w profilu Chrome (userDataDir)"
        echo ""
        echo "2. Uruchom bota:"
        echo "   node fb-bot.js"
        echo ""
        echo "3. Sprawdź proces:"
        echo "   ps aux | grep -i chrome"
        echo ""
        ;;
    
    "clean")
        echo "🧹 Czyszczenie:"
        echo "1. Cache:"
        read -p "Czy wyczyścić cache wszystkich kont? (t/N): " confirm_cache
        if [[ $confirm_cache =~ ^[Tt]$ ]]; then
            for account in accounts/*/; do
                if [ -d "$account/cache" ]; then
                    echo "Czyszczę: $account/cache"
                    rm -f "$account/cache"/*.json
                fi
            done
            echo "✅ Cache wyczczony"
        fi
        
        echo ""
        echo "2. Browser profiles:"
        read -p "Czy wyczyścić profile przeglądarek? (t/N): " confirm_browser
        if [[ $confirm_browser =~ ^[Tt]$ ]]; then
            node -e "
const AccountManager = require('./lib/account-manager');
const manager = new AccountManager();
manager.cleanBrowserProfiles();
console.log('✅ Profile przeglądarek wyczyszczone');
"
        fi
        ;;
    
    "test")
        echo "🧪 Testowanie bota:"
        echo ""
        echo "Uruchamiam bota w tle..."
        node fb-bot.js &
        BOT_PID=$!

        sleep 5

        echo ""
        echo "🌐 Procesy Chrome:"
        ps aux | grep -i chrome | grep -v grep | grep -E "(Google Chrome|chrome)" | head -10

        echo ""
        echo "📁 Profile paths:"
        find accounts/ -name "browser-profile" -type d -exec ls -la {} \;

        echo ""
        echo "🛑 Zatrzymuję bota..."
        kill $BOT_PID 2>/dev/null

        echo "✅ Test zakończony"
        ;;
    
    *)
        echo "Użycie: $0 [status|list|setup|clean|test]"
        echo ""
        echo "Komendy:"
        echo "  status  - Pokaż status wszystkich kont z browser profiles"
        echo "  list    - Lista folderów kont i browser profiles"
        echo "  setup   - Instrukcje setup"
        echo "  clean   - Wyczyść cache i/lub browser profiles"
        echo "  test    - Testuj browser isolation"
        ;;
esac
