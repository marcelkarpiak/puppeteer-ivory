const { humanMouseMove, sleep } = require('./human-behavior');

/**
 * Symuluje naturalne interakcje spoleczne na Facebooku.
 * Budzet interakcji losowany na poziomie SESJI, nie posta.
 * Wiekszosc sesji to czyste czytanie (zero interakcji).
 */
class SocialInteractions {
    constructor(page) {
        this.page = page;
        this.budget = this._planSession();
        this.reactionsGiven = 0;
        this.commentAttemptsGiven = 0;
        this.postsSinceLastInteraction = 0;
        // Blokada interakcji na poczatku sesji (2-5 minut)
        this.firstInteractionAfter = Date.now() + 120000 + Math.random() * 180000;
        // Losowy minimalny gap miedzy interakcjami (ustalany raz na sesje)
        this.minGapBase = 3 + Math.floor(Math.random() * 4); // 3-6
    }

    /**
     * Planuje budzet interakcji na cala sesje.
     * ~65% sesji = zero interakcji (czyste czytanie).
     */
    _planSession() {
        const roll = Math.random();

        if (roll < 0.65) {
            // Czyste czytanie
            return { reactions: 0, commentAttempts: 0 };
        }
        if (roll < 0.90) {
            // Lekka interakcja: 1-2 reakcje
            return {
                reactions: 1 + Math.floor(Math.random() * 2),
                commentAttempts: 0
            };
        }
        if (roll < 0.97) {
            // Umiarkowana: 1-3 reakcje, moze proba komentarza
            return {
                reactions: 1 + Math.floor(Math.random() * 3),
                commentAttempts: Math.random() < 0.25 ? 1 : 0
            };
        }
        // Zaangazowana: 2-4 reakcje + moze komentarz
        return {
            reactions: 2 + Math.floor(Math.random() * 3),
            commentAttempts: Math.random() < 0.4 ? 1 : 0
        };
    }

    getBudgetSummary() {
        if (this.budget.reactions === 0 && this.budget.commentAttempts === 0) {
            return 'sesja czytelnicza (0 interakcji)';
        }
        return `max ${this.budget.reactions} reakcji, ${this.budget.commentAttempts} prob komentarza`;
    }

    /**
     * Decyduje czy i jak wchodzic w interakcje z postem.
     * @returns {'none'|'reaction'|'comment_attempt'}
     */
    decideInteraction(postIndex, totalPosts, isKeywordMatch) {
        this.postsSinceLastInteraction++;

        // NIGDY nie reaguj na posty z keywordami
        if (isKeywordMatch) return 'none';

        // Budzet wyczerpany
        const hasReactionBudget = this.reactionsGiven < this.budget.reactions;
        const hasCommentBudget = this.commentAttemptsGiven < this.budget.commentAttempts;
        if (!hasReactionBudget && !hasCommentBudget) return 'none';

        // Za wczesnie w sesji
        if (Date.now() < this.firstInteractionAfter) return 'none';

        // Nie reaguj na pierwszych 2 i ostatni post
        if (postIndex < 2 || postIndex >= totalPosts - 1) return 'none';

        // Minimalny gap miedzy interakcjami (losowy per sprawdzenie)
        const currentMinGap = this.minGapBase + Math.floor(Math.random() * 3); // +0-2 per check
        if (this.postsSinceLastInteraction < currentMinGap) return 'none';

        // Prawdopodobienstwo maleje z kazda dana reakcja
        const baseProbability = Math.max(0.12 - (this.reactionsGiven * 0.025), 0.03);
        if (Math.random() > baseProbability) return 'none';

        // Wybierz typ interakcji
        if (hasCommentBudget && Math.random() < 0.10) {
            return 'comment_attempt';
        }
        if (hasReactionBudget) {
            return 'reaction';
        }
        return 'none';
    }

    /**
     * Wybiera typ reakcji z realistycznym rozkladem.
     */
    _chooseReaction() {
        const roll = Math.random();
        if (roll < 0.70) return 'like';
        if (roll < 0.85) return 'love';
        if (roll < 0.93) return 'haha';
        if (roll < 0.97) return 'wow';
        if (roll < 0.99) return 'sad';
        return 'angry';
    }

    /**
     * Wykonuje reakcje na poscie.
     */
    async performReaction(postHandle) {
        try {
            const reactionType = this._chooseReaction();
            console.log(`   👍 Interakcja: ${reactionType}`);

            // Znajdz przycisk Like
            const likeButton = await postHandle.$(
                '[aria-label="Lubię to"], [aria-label="Like"], [aria-label="Lubię to!"]'
            );
            if (!likeButton) {
                console.log('   ⚠️ Nie znaleziono przycisku reakcji');
                return false;
            }

            const box = await likeButton.boundingBox();
            if (!box) return false;

            // Symuluj czytanie przed reakcja (proporcjonalnie do "zaangazowania")
            await sleep(1500 + Math.random() * 2500);

            // Ruch kursora do przycisku (nie idealnie na srodek)
            const targetX = box.x + (Math.random() * 0.5 + 0.25) * box.width;
            const targetY = box.y + (Math.random() * 0.5 + 0.25) * box.height;
            await humanMouseMove(this.page, targetX, targetY);

            if (reactionType === 'like') {
                // Prosty Like - klik
                await sleep(150 + Math.random() * 350);
                await this.page.mouse.click(
                    box.x + box.width / 2,
                    box.y + box.height / 2
                );
            } else {
                // Hover zeby otworzyc picker reakcji
                await sleep(1200 + Math.random() * 800);

                const clicked = await this._clickReactionInPicker(reactionType);
                if (!clicked) {
                    // Fallback: zwykly Like
                    await sleep(200 + Math.random() * 300);
                    await this.page.mouse.click(
                        box.x + box.width / 2,
                        box.y + box.height / 2
                    );
                }
            }

            this.reactionsGiven++;
            this.postsSinceLastInteraction = 0;

            // Nie scrolluj od razu po reakcji (dwell)
            await sleep(1000 + Math.random() * 3000);

            return true;
        } catch (e) {
            console.log(`   ⚠️ Reakcja nie powiodla sie: ${e.message}`);
            return false;
        }
    }

    /**
     * Klika konkretna reakcje w pickerze (hover popup).
     */
    async _clickReactionInPicker(type) {
        // Mapowanie typ -> mozliwe aria-labels (PL + EN)
        const labelMap = {
            love: ['Super', 'Kocham to', 'Love'],
            haha: ['Ha ha', 'Haha', 'Ha Ha'],
            wow: ['Wow', 'Wow!'],
            sad: ['Przykro mi', 'Smutny', 'Sad'],
            angry: ['Wrr', 'Angry', 'Wrrr']
        };

        const labels = labelMap[type] || [];

        for (const label of labels) {
            // Szukaj w calym dokumencie (picker jest poza postHandle)
            const btn = await this.page.$(`[aria-label="${label}"]`);
            if (btn) {
                const rBox = await btn.boundingBox();
                if (rBox) {
                    await humanMouseMove(
                        this.page,
                        rBox.x + rBox.width / 2 + (Math.random() - 0.5) * 4,
                        rBox.y + rBox.height / 2 + (Math.random() - 0.5) * 4
                    );
                    await sleep(150 + Math.random() * 350);
                    await this.page.mouse.click(
                        rBox.x + rBox.width / 2,
                        rBox.y + rBox.height / 2
                    );
                    return true;
                }
            }
        }

        // Fallback: szukaj po data-testid
        const testIdMap = {
            love: 'love', haha: 'haha', wow: 'wow', sad: 'sorry', angry: 'anger'
        };
        const testId = testIdMap[type];
        if (testId) {
            const btn = await this.page.$(`[data-testid="${testId}"]`);
            if (btn) {
                const rBox = await btn.boundingBox();
                if (rBox) {
                    await humanMouseMove(this.page, rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
                    await sleep(200 + Math.random() * 300);
                    await this.page.mouse.click(rBox.x + rBox.width / 2, rBox.y + rBox.height / 2);
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Symuluje porzucona probe komentarza.
     * Klika pole komentarza, wpisuje fragment, kasuje, odchodzi.
     */
    async performCommentAttempt(postHandle) {
        try {
            console.log('   ✏️ Proba komentarza (porzucona)...');

            // Znajdz pole komentarza
            const commentInput = await postHandle.$(
                '[aria-label="Napisz komentarz"], [aria-label="Napisz komentarz..."], ' +
                '[aria-label="Write a comment"], [aria-label="Write a comment..."], ' +
                '[placeholder*="komentarz"], [placeholder*="comment"]'
            );
            if (!commentInput) {
                console.log('   ⚠️ Nie znaleziono pola komentarza');
                return false;
            }

            const box = await commentInput.boundingBox();
            if (!box) return false;

            // Podejdz do pola komentarza
            await sleep(1000 + Math.random() * 2000);
            await humanMouseMove(
                this.page,
                box.x + (Math.random() * 0.6 + 0.2) * box.width,
                box.y + (Math.random() * 0.6 + 0.2) * box.height
            );
            await sleep(200 + Math.random() * 400);
            await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

            // Poczekaj az pole sie aktywuje
            await sleep(600 + Math.random() * 1200);

            // Wpisz losowy fragment polskiego slowa
            const fragments = [
                'dob', 'cze', 'ja t', 'mog', 'to ', 'a j',
                'no ', 'faj', 'te', 'ok', 'tak', 'o ', 'wy',
                'nie', 'ale', 'do', 'na', 'ze', 'to j'
            ];
            const text = fragments[Math.floor(Math.random() * fragments.length)];

            for (const char of text) {
                await this.page.keyboard.type(char, {
                    delay: 60 + Math.random() * 140
                });
            }

            // Pauza - "zastanawianie sie" / rezygnacja
            await sleep(1500 + Math.random() * 3500);

            // Skasuj wszystko
            for (let i = 0; i < text.length; i++) {
                await this.page.keyboard.press('Backspace');
                await sleep(25 + Math.random() * 65);
            }

            // Uciekaj z pola
            await sleep(300 + Math.random() * 700);
            await this.page.keyboard.press('Escape');
            await sleep(200 + Math.random() * 500);

            this.commentAttemptsGiven++;
            this.postsSinceLastInteraction = 0;

            return true;
        } catch (e) {
            console.log(`   ⚠️ Proba komentarza nie powiodla sie: ${e.message}`);
            return false;
        }
    }
}

module.exports = SocialInteractions;
