import { DiffView } from '../../views/diff-view';
import { Messenger } from '../../ui/messaging';
import { mountPanel } from './helpers/fixture';

const LEFT = JSON.stringify({ keep: 1, changed: 'before', gone: true });
const RIGHT = JSON.stringify({ keep: 1, changed: 'after', added: 42 });

function setInputs(left: string, right: string): void {
    (document.getElementById('left-json') as HTMLTextAreaElement).value = left;
    (document.getElementById('right-json') as HTMLTextAreaElement).value = right;
}

function items(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.diff-item'));
}

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

function click(selector: string, root: ParentNode = document): void {
    root.querySelector<HTMLElement>(selector)?.click();
}

describe('DiffView', () => {
    let view: DiffView;

    beforeEach(() => {
        mountPanel('diff');
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
        expect(el('apply-all-diffs').hidden).toBe(false);

        setInputs(LEFT, LEFT);
        view.compare();
        expect(el('apply-all-diffs').hidden).toBe(true);
    });

    it('reports an error without leaving bulk actions visible', () => {
        view.compare();
        setInputs('{ not json', RIGHT);
        view.compare();

        expect(document.querySelector('.diff-error')).not.toBeNull();
        expect(el('reject-all-diffs').hidden).toBe(true);
    });

    describe('change rows', () => {
        beforeEach(() => view.compare());

        it('renders the path as segments with the leaf emphasised', () => {
            setInputs(
                JSON.stringify({ data: { users: [{ email: 'a@b.com' }] } }),
                JSON.stringify({ data: { users: [{ email: 'x@y.com' }] } })
            );
            view.compare();

            const path = document.querySelector('.diff-path') as HTMLElement;
            const segments = Array.from(path.querySelectorAll('.diff-path__segment')).map(
                s => s.textContent
            );
            const leaf = path.querySelector('.diff-path__leaf')?.textContent;

            expect(segments).toEqual(['data', 'users', '[0]']);
            expect(leaf).toBe('email');
        });

        it('marks array indices distinctly from object keys', () => {
            setInputs(JSON.stringify({ list: ['a'] }), JSON.stringify({ list: ['b'] }));
            view.compare();

            const index = document.querySelector('.diff-path__index');
            expect(index?.textContent).toBe('[0]');
        });

        it('shows old and new values for a modification', () => {
            const modified = items().find(
                item => item.dataset.diffType === 'modified'
            ) as HTMLElement;

            expect(modified.querySelector('.old-value')?.textContent).toBe('"before"');
            expect(modified.querySelector('.new-value')?.textContent).toBe('"after"');
        });

        it('shows only the new value for an addition', () => {
            const added = items().find(item => item.dataset.diffType === 'added') as HTMLElement;

            expect(added.querySelector('.new-value')).not.toBeNull();
            expect(added.querySelector('.old-value')).toBeNull();
        });

        it('shows only the old value for a removal', () => {
            const removed = items().find(
                item => item.dataset.diffType === 'removed'
            ) as HTMLElement;

            expect(removed.querySelector('.old-value')).not.toBeNull();
            expect(removed.querySelector('.new-value')).toBeNull();
        });

        it('starts every row pending', () => {
            for (const row of items()) {
                expect(row.dataset.state).toBe('pending');
            }
        });
    });

    describe('per-row resolution', () => {
        beforeEach(() => view.compare());

        it('marks a row applied and swaps its actions for undo', () => {
            const row = items()[0];
            click('.apply-diff-btn', row);

            expect(row.dataset.state).toBe('applied');
            expect(row.querySelector<HTMLElement>('.apply-diff-btn')?.hidden).toBe(true);
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(false);
            expect(view.getStates().get(row.dataset.diffId ?? '')).toBe('applied');
        });

        it('marks a row rejected without touching the left document', () => {
            const before = el<HTMLTextAreaElement>('left-json').value;
            const row = items()[0];
            click('.reject-diff-btn', row);

            expect(row.dataset.state).toBe('rejected');
            expect(view.getStates().get(row.dataset.diffId ?? '')).toBe('rejected');
            expect(el<HTMLTextAreaElement>('left-json').value).toBe(before);
        });

        it('returns a row to pending on undo', () => {
            const row = items()[0];
            click('.reject-diff-btn', row);
            click('.undo-diff-btn', row);

            expect(row.dataset.state).toBe('pending');
            expect(row.querySelector<HTMLElement>('.apply-diff-btn')?.hidden).toBe(false);
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(true);
            expect(view.getStates().get(row.dataset.diffId ?? '')).toBe('pending');
        });

        it('rewrites the left document when a change is applied', () => {
            const modified = items().find(item => item.dataset.diffType === 'modified');
            click('.apply-diff-btn', modified as HTMLElement);

            expect(JSON.parse(el<HTMLTextAreaElement>('left-json').value).changed).toBe('after');
        });

        it('restores the previous value when an applied change is undone', () => {
            const modified = items().find(
                item => item.dataset.diffType === 'modified'
            ) as HTMLElement;

            click('.apply-diff-btn', modified);
            click('.undo-diff-btn', modified);

            expect(JSON.parse(el<HTMLTextAreaElement>('left-json').value).changed).toBe('before');
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
                expect(row.dataset.state).toBe('rejected');
                expect(states.get(row.dataset.diffId ?? '')).toBe('rejected');
            }
        });

        it('leaves each row individually undoable afterwards', () => {
            click('#reject-all-diffs');

            const row = items()[0];
            expect(row.querySelector<HTMLElement>('.undo-diff-btn')?.hidden).toBe(false);

            click('.undo-diff-btn', row);
            expect(view.getStates().get(row.dataset.diffId ?? '')).toBe('pending');
            expect(row.dataset.state).toBe('pending');
        });
    });

    describe('apply all', () => {
        it('applies every change and leaves the documents equal', () => {
            view.compare();
            click('#apply-all-diffs');

            expect(items()).toHaveLength(0);
            expect(JSON.parse(el<HTMLTextAreaElement>('left-json').value)).toEqual(
                JSON.parse(el<HTMLTextAreaElement>('right-json').value)
            );
        });
    });

    /*
     * Array positions are expressed in the coordinates of the document the
     * comparison ran against. Applying rows one at a time used to mutate that
     * document underneath the remaining rows, so their indices drifted.
     */
    describe('arrays', () => {
        const left = () => JSON.parse(el<HTMLTextAreaElement>('left-json').value);

        it('reports a head insertion as a single change', () => {
            setInputs(JSON.stringify({ l: [1, 2, 3] }), JSON.stringify({ l: [0, 1, 2, 3] }));
            view.compare();

            expect(items()).toHaveLength(1);
            expect(items()[0].dataset.diffType).toBe('added');
        });

        it('applies rows in any order to the same result', () => {
            setInputs(JSON.stringify({ l: ['a', 'b', 'c'] }), JSON.stringify({ l: ['x', 'b', 'y'] }));
            view.compare();

            const rows = items();
            for (const row of rows.reverse()) {
                click('.apply-diff-btn', row);
            }

            expect(left()).toEqual({ l: ['x', 'b', 'y'] });
        });

        it('undoes one row without disturbing the others', () => {
            setInputs(JSON.stringify({ l: [1, 2, 3, 4] }), JSON.stringify({ l: [1, 9, 3, 8] }));
            view.compare();

            const rows = items();
            rows.forEach(row => click('.apply-diff-btn', row));
            expect(left()).toEqual({ l: [1, 9, 3, 8] });

            click('.undo-diff-btn', rows[0]);
            expect(left()).toEqual({ l: [1, 2, 3, 8] });
        });

        it('keeps a key whose value became null', () => {
            setInputs(JSON.stringify({ a: 1 }), JSON.stringify({ a: null }));
            view.compare();

            expect(items()[0].dataset.diffType).toBe('modified');

            click('.apply-diff-btn', items()[0]);
            expect(left()).toEqual({ a: null });
        });
    });

    describe('filters', () => {
        beforeEach(() => view.compare());

        const chip = (filter: string) =>
            document.querySelector<HTMLElement>(`[data-diff-filter="${filter}"]`) as HTMLElement;

        it('shows the chip row only when there are changes', () => {
            expect(el('diff-filters').hidden).toBe(false);

            setInputs(LEFT, LEFT);
            view.compare();
            expect(el('diff-filters').hidden).toBe(true);
        });

        it('counts each kind of change', () => {
            expect(chip('all').dataset.count).toBe('3');
            expect(chip('added').dataset.count).toBe('1');
            expect(chip('removed').dataset.count).toBe('1');
            expect(chip('modified').dataset.count).toBe('1');
            expect(chip('added').querySelector('.chip__count')?.textContent).toBe('1');
        });

        it('narrows the list through one attribute', () => {
            chip('added').click();

            expect(el('diff-output').dataset.filter).toBe('added');
            expect(chip('added').classList.contains('is-active')).toBe(true);
            expect(chip('all').classList.contains('is-active')).toBe(false);
        });

        it('returns to all changes', () => {
            chip('removed').click();
            chip('all').click();

            expect(el('diff-output').dataset.filter).toBe('all');
            expect(chip('all').classList.contains('is-active')).toBe(true);
        });

        it('resets the filter on a fresh comparison', () => {
            chip('added').click();
            view.compare();

            expect(el('diff-output').dataset.filter).toBe('all');
            expect(chip('all').classList.contains('is-active')).toBe(true);
        });
    });

    describe('strict mode', () => {
        it('ignores keys that exist only on the right', () => {
            view.compare();
            const loose = items().length;

            click('#strict-diff-toggle');

            expect(view.strictMode).toBe(true);
            expect(items().length).toBeLessThan(loose);
            expect(items().some(item => item.dataset.diffType === 'added')).toBe(false);
        });
    });

    describe('clearing', () => {
        it('empties a side and discards the rendered changes', () => {
            view.compare();
            click('#clear-left-json');

            expect(el<HTMLTextAreaElement>('left-json').value).toBe('');
            expect(items()).toHaveLength(0);
            expect(view.getStates().size).toBe(0);
            expect(el('diff-filters').hidden).toBe(true);
        });
    });
});
