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

/** Types a term and lets the debounce elapse. */
function type(term: string): void {
    const input = el<HTMLInputElement>('find-input');
    input.value = term;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    jest.runOnlyPendingTimers();
}

function marks(): HTMLElement[] {
    return Array.from(el('output').querySelectorAll<HTMLElement>('.search-highlight'));
}

function counter(): string {
    return el('find-count').textContent ?? '';
}

function press(key: string, init: Partial<KeyboardEventInit> = {}): void {
    el('find-input').dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    );
}

function option(name: string): void {
    document.querySelector<HTMLElement>(`[data-find-option="${name}"]`)?.click();
}

function scope(name: string): void {
    document.querySelector<HTMLElement>(`[data-find-scope="${name}"]`)?.click();
}

describe('FindWidget', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        startFormatted();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('marks every match and reports the position', () => {
        openFind();
        type('name');

        // name, Name, nested.name, and the "name" array item -- case-insensitive
        expect(counter()).toBe('1 of 4');
        expect(marks().length).toBeGreaterThan(0);
    });

    it('reports when nothing matches', () => {
        openFind();
        type('zzz');

        expect(counter()).toBe('No results');
        expect(marks()).toHaveLength(0);
        expect(el<HTMLButtonElement>('find-next').disabled).toBe(true);
    });

    /*
     * Searching used to run on every keystroke, walking the rendered document
     * each time. Waiting for a pause means one search per word, not per letter.
     */
    it('waits for typing to pause before searching', () => {
        openFind();
        const input = el<HTMLInputElement>('find-input');

        for (const term of ['n', 'na', 'nam', 'name']) {
            input.value = term;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        expect(counter()).toBe('');

        jest.runOnlyPendingTimers();
        expect(counter()).toBe('1 of 4');
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

        expect(document.querySelectorAll('.search-highlight.current').length).toBeGreaterThan(0);
        const currents = new Set(
            Array.from(document.querySelectorAll('.search-highlight.current')).map(node =>
                node.closest('.json-line')?.getAttribute('data-line')
            )
        );
        expect(currents.size).toBe(1);
    });

    it('closes on Escape and drops the marks', () => {
        openFind();
        type('name');

        press('Escape');

        expect(el('find-widget').hidden).toBe(true);
        expect(marks()).toHaveLength(0);
    });

    it('restores the previous term when reopened', () => {
        openFind();
        type('name');
        press('Escape');

        openFind();
        expect(el<HTMLInputElement>('find-input').value).toBe('name');
        expect(counter()).toBe('1 of 4');
    });

    describe('match case', () => {
        it('is off by default', () => {
            openFind();
            type('NAME');
            expect(counter()).toBe('1 of 4');
        });

        it('narrows to exact case when on', () => {
            openFind();
            type('Name');
            option('matchCase');

            expect(counter()).toBe('1 of 1');
        });
    });

    describe('scope', () => {
        it('defaults to searching everything', () => {
            openFind();
            type('name');
            expect(counter()).toBe('1 of 4');
        });

        it('restricts to keys', () => {
            openFind();
            type('name');
            scope('keys');

            // "name", "Name" and nested "name" are property names; the array
            // element "name" is a value.
            expect(counter()).toBe('1 of 3');
        });

        it('restricts to values', () => {
            openFind();
            type('name');
            scope('values');

            expect(counter()).toBe('1 of 1');
        });
    });

    describe('regular expressions', () => {
        it('reports an invalid pattern instead of silently finding nothing', () => {
            openFind();
            option('regex');
            type('[unclosed');

            expect(counter()).toBe('Invalid pattern');
        });

        it('does not lowercase the pattern when match case is off', () => {
            openFind();
            option('regex');
            // \S would become \s -- the opposite class -- if the pattern were
            // lowercased before compiling.
            type('\\S+');

            expect(counter()).not.toBe('No results');
        });

        it('matches with a pattern', () => {
            openFind();
            option('regex');
            type('"n[a-z]+"');

            expect(counter()).toMatch(/of \d+/);
        });
    });

    describe('the gutter', () => {
        /* Line numbers are chrome, not content: a search for "12" must not
           light up the gutter. */
        it('is never matched', () => {
            startFormatted(JSON.stringify({ a: 1, b: 2, c: 3, d: 4, e: 5 }));
            openFind();
            type('3');

            for (const mark of marks()) {
                expect(mark.closest('.line-number')).toBeNull();
            }
            expect(counter()).toBe('1 of 1');
        });
    });

    describe('re-rendering', () => {
        it('keeps the marks after toggling line numbers', () => {
            openFind();
            type('name');
            const before = marks().length;

            el('line-numbers-toggle').click();

            expect(marks().length).toBe(before);
            expect(counter()).toBe('1 of 4');
        });
    });
});
