import { DiffView } from '../../views/diff-view';
import { Messenger } from '../../ui/messaging';

const LEFT = JSON.stringify({ keep: 1, changed: 'before', gone: true });
const RIGHT = JSON.stringify({ keep: 1, changed: 'after', added: 42 });

function buildLayout(): void {
    document.body.innerHTML = `
        <button id="strict-diff-toggle"></button>
        <div id="diff-container">
            <div id="left-json-panel">
                <button id="copy-left-json"></button>
                <button id="clear-left-json"></button>
                <textarea id="left-json"></textarea>
            </div>
            <div id="diff-result-panel">
                <button id="apply-all-diffs" hidden></button>
                <button id="reject-all-diffs" hidden></button>
                <div id="diff-output"></div>
            </div>
            <div id="right-json-panel">
                <button id="clear-right-json"></button>
                <textarea id="right-json"></textarea>
            </div>
        </div>`;
}

function setInputs(left: string, right: string): void {
    (document.getElementById('left-json') as HTMLTextAreaElement).value = left;
    (document.getElementById('right-json') as HTMLTextAreaElement).value = right;
}

function items(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.diff-item'));
}

function click(selector: string, root: ParentNode = document): void {
    root.querySelector<HTMLElement>(selector)?.click();
}

describe('DiffView', () => {
    let view: DiffView;

    beforeEach(() => {
        buildLayout();
        view = new DiffView(new Messenger());
        setInputs(LEFT, RIGHT);
    });

    afterEach(() => {
        view.dispose();
    });

    it('renders one row per change', () => {
        view.compare();
        // changed -> modified, gone -> removed, added -> added
        expect(items()).toHaveLength(3);
    });

    it('reveals the bulk action buttons only when there are changes', () => {
        view.compare();
        expect(document.getElementById('apply-all-diffs')?.hidden).toBe(false);

        setInputs(LEFT, LEFT);
        view.compare();
        expect(document.getElementById('apply-all-diffs')?.hidden).toBe(true);
    });

    it('reports an error without leaving bulk actions visible', () => {
        view.compare();
        setInputs('{ not json', RIGHT);
        view.compare();

        expect(document.querySelector('.diff-error')).not.toBeNull();
        expect(document.getElementById('reject-all-diffs')?.hidden).toBe(true);
    });

    describe('per-row resolution', () => {
        beforeEach(() => view.compare());

        it('marks a row applied and swaps its actions for undo', () => {
            const row = items()[0];
            click('.apply-diff-btn', row);

            expect(row.classList.contains('diff-applied')).toBe(true);
            expect(row.querySelector<HTMLElement>('.apply-diff-btn')?.hidden).toBe(true);
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(false);
            expect(view.getStates().get(row.getAttribute('data-diff-id') ?? '')).toBe('applied');
        });

        it('marks a row rejected without touching the left document', () => {
            const before = (document.getElementById('left-json') as HTMLTextAreaElement).value;
            const row = items()[0];
            click('.reject-diff-btn', row);

            expect(row.classList.contains('diff-rejected')).toBe(true);
            expect(view.getStates().get(row.getAttribute('data-diff-id') ?? '')).toBe('rejected');
            expect((document.getElementById('left-json') as HTMLTextAreaElement).value).toBe(before);
        });

        it('returns a row to pending on undo', () => {
            const row = items()[0];
            click('.reject-diff-btn', row);
            click('.undo-diff-btn', row);

            expect(row.classList.contains('diff-rejected')).toBe(false);
            expect(row.querySelector<HTMLElement>('.apply-diff-btn')?.hidden).toBe(false);
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(true);
            expect(view.getStates().get(row.getAttribute('data-diff-id') ?? '')).toBe('pending');
        });

        it('rewrites the left document when a change is applied', () => {
            const modified = items().find(item => item.getAttribute('data-diff-type') === 'modified');
            click('.apply-diff-btn', modified as HTMLElement);

            const left = JSON.parse((document.getElementById('left-json') as HTMLTextAreaElement).value);
            expect(left.changed).toBe('after');
        });

        it('restores the previous value when an applied change is undone', () => {
            const modified = items().find(
                item => item.getAttribute('data-diff-type') === 'modified'
            ) as HTMLElement;

            click('.apply-diff-btn', modified);
            click('.undo-diff-btn', modified);

            const left = JSON.parse((document.getElementById('left-json') as HTMLTextAreaElement).value);
            expect(left.changed).toBe('before');
        });
    });

    /*
     * Reject-all used to only add a CSS class, so the recorded state still said
     * "pending" and a later undo on a row behaved as though it had never been
     * rejected. The visual state and the recorded state must not diverge.
     */
    describe('reject all', () => {
        beforeEach(() => view.compare());

        it('records every row as rejected, not just styles them', () => {
            click('#reject-all-diffs');

            const states = view.getStates();
            expect(states.size).toBe(items().length);
            for (const row of items()) {
                expect(row.classList.contains('diff-rejected')).toBe(true);
                expect(states.get(row.getAttribute('data-diff-id') ?? '')).toBe('rejected');
            }
        });

        it('leaves each row individually undoable afterwards', () => {
            click('#reject-all-diffs');

            const row = items()[0];
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(false);

            click('.undo-diff-btn', row);
            expect(view.getStates().get(row.getAttribute('data-diff-id') ?? '')).toBe('pending');
            expect(row.classList.contains('diff-rejected')).toBe(false);
        });
    });

    describe('apply all', () => {
        it('applies every change and leaves the documents equal', () => {
            view.compare();
            click('#apply-all-diffs');

            expect(items()).toHaveLength(0);
            const left = (document.getElementById('left-json') as HTMLTextAreaElement).value;
            const right = (document.getElementById('right-json') as HTMLTextAreaElement).value;
            expect(JSON.parse(left)).toEqual(JSON.parse(right));
        });
    });

    describe('strict mode', () => {
        it('ignores keys that exist only on the right', () => {
            view.compare();
            const loose = items().length;

            click('#strict-diff-toggle');

            expect(view.strictMode).toBe(true);
            expect(items().length).toBeLessThan(loose);
            expect(items().some(item => item.getAttribute('data-diff-type') === 'added')).toBe(false);
        });
    });

    describe('clearing', () => {
        it('empties a side and discards the rendered changes', () => {
            view.compare();
            click('#clear-left-json');

            expect((document.getElementById('left-json') as HTMLTextAreaElement).value).toBe('');
            expect(items()).toHaveLength(0);
            expect(view.getStates().size).toBe(0);
        });
    });
});
