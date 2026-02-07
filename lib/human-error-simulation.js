const { setTimeout } = require('timers/promises');
console.log('✅ Loaded lib/human-error-simulation.js');

/**
 * Symuluje ludzkie błędy i naturalne zachowania naprawcze
 */
class HumanErrorSimulation {
    constructor(page) {
        this.page = page;
        this.errorTypes = [
            this.misclick.bind(this),
            this.typoError.bind(this),
            this.scrollTooFar.bind(this),
            this.lostFocus.bind(this),
            // accidentalTab USUNIETE: Ctrl+T/Ctrl+W moze zamknac tab bota (audit #10)
            this.hesitation.bind(this)
        ];
    }

    /**
     * Losowo symuluje błąd ludzki (10-20% szans)
     */
    async simulateRandomError() {
        if (Math.random() < 0.15) { // 15% szans na błąd
            const error = this.errorTypes[Math.floor(Math.random() * this.errorTypes.length)];
            try {
                await error();
            } catch (e) {
                // Błędy w symulacji są normalne
            }
        }
    }

    /**
     * Symuluje przypadkowe kliknięcie w zły element
     */
    async misclick() {
        console.log('   🤦 Symuluję przypadkowe kliknięcie...');
        
        try {
            const viewport = this.page.viewport();
            
            // Kliknij w losowe miejsce na stronie (nie w interaktywny element)
            const x = Math.random() * viewport.width;
            const y = Math.random() * viewport.height;
            
            await this.page.mouse.click(x, y);
            await setTimeout(500);
            
            // Cofnij działanie - kliknij w bezpieczne miejsce
            await this.page.mouse.click(viewport.width / 2, 100); // Góra strony
            await setTimeout(1000);
            
        } catch (e) {
            // Ignoruj błędy misclick
        }
    }

    /**
     * Symuluje literówkę i poprawkę
     */
    async typoError() {
        console.log('   ⌨️ Symuluję literówkę i poprawkę...');
        
        try {
            // Znajdź pole input (np. search)
            const inputs = await this.page.$$('input[type="search"], input[placeholder*="szukaj"], input[placeholder*="search"]');
            
            if (inputs.length > 0) {
                const input = inputs[0];
                await input.click();
                
                // Wpisz z literówką
                const typoText = 'szabjm'; // zamiast 'szukam'
                await this.page.keyboard.type(typoText, { delay: 100 });
                await setTimeout(500);
                
                // Usuń literówkę
                for (let i = 0; i < typoText.length; i++) {
                    await this.page.keyboard.press('Backspace');
                    await setTimeout(50);
                }
                
                await setTimeout(300);
                await this.page.evaluate(() => document.activeElement.blur());
            }
        } catch (e) {
            // Ignoruj błędy
        }
    }

    /**
     * Symuluje przewinięcie za daleko i powrót
     */
    async scrollTooFar() {
        console.log('   📜 Symuluję przewinięcie za daleko...');
        
        try {
            // Przewiń bardzo daleko w dół
            await this.page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            await setTimeout(1000);
            
            // Poczekaj chwilę jakby użytkownik się zorientował
            await setTimeout(2000);
            
            // Wróć powoli w górę
            await this.page.evaluate(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            await setTimeout(2000);
            
        } catch (e) {
            // Ignoruj błędy scrollowania
        }
    }

    /**
     * Symuluje utratę fokusa i odzyskanie
     */
    async lostFocus() {
        console.log('   🎯 Symuluję utratę fokusa...');
        
        try {
            // Kliknij w losowy element aby uzyskać focus
            const focusableElements = await this.page.$$('button, a, input');
            if (focusableElements.length > 0) {
                const element = focusableElements[Math.floor(Math.random() * focusableElements.length)];
                await element.focus();
                await setTimeout(1000);
                
                // Kliknij w tło aby stracić focus
                const viewport = this.page.viewport();
                await this.page.mouse.click(viewport.width / 2, viewport.height / 2);
                await setTimeout(500);
                
                // Ponownie uzyskaj focus na tym samym elemencie
                await element.focus();
                await setTimeout(500);
            }
        } catch (e) {
            // Ignoruj błędy
        }
    }

    /**
     * Symuluje przypadkowe otwarcie nowego taba i zamknięcie
     */
    async accidentalTab() {
        console.log('   📑 Symuluję przypadkowy nowy tab...');
        
        try {
            // Otwórz nowy tab (Ctrl+T lub Cmd+T)
            const isMac = process.platform === 'darwin';
            if (isMac) {
                await this.page.keyboard.down('Meta');
                await this.page.keyboard.press('t');
                await this.page.keyboard.up('Meta');
            } else {
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('t');
                await this.page.keyboard.up('Control');
            }
            
            await setTimeout(1000);
            
            // Zamknij tab (Ctrl+W lub Cmd+W)
            if (isMac) {
                await this.page.keyboard.down('Meta');
                await this.page.keyboard.press('w');
                await this.page.keyboard.up('Meta');
            } else {
                await this.page.keyboard.down('Control');
                await this.page.keyboard.press('w');
                await this.page.keyboard.up('Control');
            }
            
            await setTimeout(500);
            
        } catch (e) {
            // Ignoruj błędy
        }
    }

    /**
     * Symuluje zawahanie przed akcją
     */
    async hesitation() {
        console.log('   🤔 Symuluję zawahanie...');
        
        try {
            // Najpierw najedź na element
            const buttons = await this.page.$$('button, a[href]');
            if (buttons.length > 0) {
                const button = buttons[Math.floor(Math.random() * buttons.length)];
                const box = await button.boundingBox();
                
                if (box) {
                    // Najedź na element
                    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await setTimeout(2000); // Długa pauza - zawahanie
                    
                    // Odejdź od elementu bez klikania
                    await this.page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
                    await setTimeout(1000);
                }
            }
        } catch (e) {
            // Ignoruj błędy
        }
    }

    /**
     * Symuluje "gapienie się" w ekran - brak akcji przez kilka sekund
     */
    async stareAtScreen() {
        if (Math.random() < 0.1) { // 10% szans
            console.log('   👀 Symuluję wpatrywanie się w ekran...');
            const stareTime = Math.floor(Math.random() * 3000) + 2000; // 2-5 sekund
            await setTimeout(stareTime);
        }
    }

    /**
     * Symuluje podwójne kliknięcie (zamiast pojedynczego)
     */
    async accidentalDoubleClick() {
        if (Math.random() < 0.05) { // 5% szans
            console.log('   👆 Symuluję przypadkowe podwójne kliknięcie...');
            
            try {
                const viewport = this.page.viewport();
                const x = Math.random() * viewport.width;
                const y = Math.random() * viewport.height;
                
                await this.page.mouse.click(x, y, { clickCount: 2 });
                await setTimeout(1000);
                
                // Cofnij - pojedyncze kliknięcie w bezpieczne miejsce
                await this.page.mouse.click(viewport.width / 2, 100);
                await setTimeout(500);
            } catch (e) {
                // Ignoruj błędy
            }
        }
    }

    /**
     * Symuluje przypadkowe przeciągnięcie (drag)
     */
    async accidentalDrag() {
        if (Math.random() < 0.03) { // 3% szans
            console.log('   ✋ Symuluję przypadkowe przeciągnięcie...');
            
            try {
                const viewport = this.page.viewport();
                const startX = Math.random() * viewport.width;
                const startY = Math.random() * viewport.height;
                const endX = startX + (Math.random() - 0.5) * 200;
                const endY = startY + (Math.random() - 0.5) * 200;
                
                await this.page.mouse.move(startX, startY);
                await this.page.mouse.down();
                await setTimeout(500);
                await this.page.mouse.move(endX, endY, { steps: 10 });
                await this.page.mouse.up();
                await setTimeout(1000);
            } catch (e) {
                // Ignoruj błędy
            }
        }
    }

    /**
     * Kompletna symulacja różnych błędów ludzkich
     */
    async simulateHumanErrors() {
        await this.simulateRandomError();
        await this.stareAtScreen();
        await this.accidentalDoubleClick();
        await this.accidentalDrag();
    }
}

module.exports = HumanErrorSimulation;
