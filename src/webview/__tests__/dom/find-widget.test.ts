import { Shell } from '../../shell';
import { mountPanel } from './helpers/fixture';

const SAMPLE = JSON.stringify({
    name: 'alpha',
    Name: 'BETA',
    nested: { name: 'gamma', total: 12 },
    items: ['name', 'other']
});

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function startFormatted(json = SAMPLE): void {
    mountPanel('format');
    new Shell().start();
    el<HTMLTextAreaElement>('input').value = json;
    el('action-btn').click();
}

function openFind(): void {
    el('search-toggle').click();
}

function type(term: string): void {
    const input = el<HTMLInputElement>('find-input');
    input.value = term;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

function matches(): HTMLElement[] {
    return Array.from(el('output').querySelectorAll<HTMLElement>('.search-highlight'));
}

/** Distinct match groups, since one match can be split across text nodes. */
function matchCount(): number {
    return new Set(matches().map(m => m.getAttribute('data-match-id'))).size;
}

function counter(): string {
    return el('find-count').textContent ?? '';
}

function press(key: string, init: Partial<KeyboardEventInit> = {}): void {
    el('find-input').dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    );
}

describe('FindWidget', () => {
    beforeEach(() => startFormatted());

    it('highlights every match and reports the position', () => {
        openFind();
        type('name');

        // name, Name, nested.name, and the "name" array item -- case-insensitive
        expect(matchCount()).toBe(4);
        expect(counter()).toBe('1 of 4');
    });

    it('reports when nothing matches', () => {
        openFind();
        type('nonexistent');

        expect(matchCount()).toBe(0);
        expect(counter()).toBe('No results');
    });

    it('disables navigation when there are no matches', () => {
        openFind();
        type('nonexistent');

        expect(el<HTMLButtonElement>('find-next').disabled).toBe(true);
        expect(el<HTMLButtonElement>('find-prev').disabled).toBe(true);
    });

    it('advances and wraps through matches', () => {
        openFind();
        type('name');

        el('find-next').click();
        expect(counter()).toBe('2 of 4');

        el('find-prev').click();
        expect(counter()).toBe('1 of 4');

        el('find-prev').click();
        expect(counter()).toBe('4 of 4');
    });

    it('navigates with Enter and Shift+Enter', () => {
        openFind();
        type('name');

        press('Enter');
        expect(counter()).toBe('2 of 4');

        press('Enter', { shiftKey: true });
        expect(counter()).toBe('1 of 4');
    });

    it('marks exactly one match as current', () => {
        openFind();
        type('name');

        expect(matches().filter(m => m.classList.contains('current'))).toHaveLength(1);
    });

    it('closes on Escape and drops the highlights', () => {
        openFind();
        type('name');
        press('Escape');

        expect(el('find-widget').hidden).toBe(true);
        expect(matchCount()).toBe(0);
    });

    it('restores the previous term when reopened', () => {
        openFind();
        type('name');
        press('Escape');

        openFind();
        expect(el<HTMLInputElement>('find-input').value).toBe('name');
        expect(matchCount()).toBe(4);
    });

    describe('match case', () => {
        it('is off by default', () => {
            openFind();
            type('NAME');
            expect(matchCount()).toBe(4);
        });

        it('restricts to exact casing when on', () => {
            openFind();
            type('Name');
            el('find-match-case').click();

            // Only the "Name" key; "name" occurrences no longer qualify.
            expect(matchCount()).toBe(1);
            expect(matches()[0].textContent).toBe('Name');
        });
    });

    describe('scope', () => {
        it('defaults to searching everything', () => {
            openFind();
            type('name');
            expect(matchCount()).toBe(4);
        });

        it('restricts to keys', () => {
            openFind();
            type('name');
            el('find-widget').querySelector<HTMLElement>('[data-find-scope="keys"]')?.click();

            // name, Name and nested.name are keys; the array item is a value.
            expect(matchCount()).toBe(3);
            for (const match of matches()) {
                expect(match.closest('.key')).not.toBeNull();
            }
        });

        it('restricts to values', () => {
            openFind();
            type('name');
            el('find-widget').querySelector<HTMLElement>('[data-find-scope="values"]')?.click();

            expect(matchCount()).toBe(1);
            expect(matches()[0].closest('.string')).not.toBeNull();
        });

        it('marks the active scope', () => {
            openFind();
            const keys = el('find-widget').querySelector<HTMLElement>('[data-find-scope="keys"]');
            const all = el('find-widget').querySelector<HTMLElement>('[data-find-scope="all"]');

            keys?.click();

            expect(keys?.classList.contains('is-active')).toBe(true);
            expect(all?.classList.contains('is-active')).toBe(false);
        });
    });

    describe('regular expressions', () => {
        it('matches a pattern when enabled', () => {
            openFind();
            type('n[ae]sted');
            expect(matchCount()).toBe(0);

            el('find-regex').click();
            expect(matchCount()).toBe(1);
        });

        it('reports an invalid pattern instead of silently finding nothing', () => {
            openFind();
            el('find-regex').click();
            type('[unclosed');

            expect(counter()).toBe('Invalid pattern');
            expect(el('find-count').classList.contains('is-error')).toBe(true);
        });

        it('does not lowercase the pattern when match case is off', () => {
            openFind();
            el('find-regex').click();
            // \S would become \s if the pattern were lowercased, matching
            // whitespace instead of non-whitespace.
            type('\\S+');

            expect(matchCount()).toBeGreaterThan(0);
            expect(counter()).not.toBe('Invalid pattern');
        });
    });

    /*
     * The gutter is chrome, not content. Matching it meant searching for a
     * number lit up line numbers alongside real hits.
     */
    describe('line numbers', () => {
        it('never matches the gutter', () => {
            startFormatted(JSON.stringify({ total: 12 }));
            openFind();
            type('1');

            for (const match of matches()) {
                expect(match.closest('.line-numbers')).toBeNull();
            }
            // Only the "12" value contains a 1.
            expect(matchCount()).toBe(1);
        });
    });

    describe('re-rendering', () => {
        it('keeps the highlights after toggling line numbers', () => {
            openFind();
            type('name');
            expect(matchCount()).toBe(4);

            el('line-numbers-toggle').click();

            expect(matchCount()).toBe(4);
        });
    });
});
