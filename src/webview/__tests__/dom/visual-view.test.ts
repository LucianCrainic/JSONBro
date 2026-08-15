/**
 * The visual view, in both of its shapes.
 *
 * It parses nothing of its own -- it renders the document the format view
 * produced -- so these drive it the way a user would.
 */
import { Messenger } from '../../ui/messaging';
import { PrettySink } from '../../engine/pretty-sink';
import { parseInto } from '../../engine/recovering-parser';
import { formatPath, VisualView } from '../../views/visual-view';
import { mountPanel } from './helpers/fixture';

const SAMPLE = JSON.stringify({
    name: 'JSONBro',
    count: 2,
    tags: ['fast', 'safe'],
    author: { first: 'Ada', roles: ['admin'] },
    empty: {}
});

function show(view: VisualView, json = SAMPLE): void {
    const { value, diagnostics } = parseInto(json, new PrettySink({ indent: 2 }));
    view.setDocument(value, diagnostics);
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>('.tree-row'));
const texts = () => rows().map(row => row.textContent ?? '');
const rowFor = (start: string) => rows().find(row => row.textContent?.startsWith(start)) as HTMLElement;
/** An array element has no key, so its row text starts with the type badge. */
const rowWith = (text: string) =>
    rows().find(row => row.textContent?.includes(text)) as HTMLElement;
const selected = () => document.querySelector<HTMLElement>('.tree-row.is-selected');
/*
 * The path alone. The bar around it also carries the actions that act on the
 * selected node, which used to sit in the pane header among the ones that
 * reshape the whole document.
 */
const breadcrumb = () => document.getElementById('visual-path')?.textContent ?? '';
/** Whether the bar is offering the actions that need a selected node. */
const nodeActionsShown = () =>
    document.getElementById('visual-breadcrumb')?.dataset.selected === 'true';

describe('VisualView', () => {
    let view: VisualView;

    beforeEach(() => {
        mountPanel('format');
        view = new VisualView(new Messenger());
    });

    afterEach(() => {
        view.dispose();
    });

    it('renders one row per node and none for a closing bracket', () => {
        show(view);

        // 8 objects/scalars at the top plus 2 tags, 2 author members, 1 role.
        expect(texts()).toEqual([
            expect.stringContaining('root'),
            expect.stringContaining('name'),
            expect.stringContaining('count'),
            expect.stringContaining('tags'),
            expect.stringContaining('"fast"'),
            expect.stringContaining('"safe"'),
            expect.stringContaining('author'),
            expect.stringContaining('first'),
            expect.stringContaining('roles'),
            expect.stringContaining('"admin"'),
            expect.stringContaining('empty')
        ]);
        expect(texts().some(text => text.trim() === '}')).toBe(false);
    });

    it('summarises a container rather than dumping it', () => {
        show(view);

        expect(rowFor('tags').textContent).toContain('2 items');
        expect(rowFor('author').textContent).toContain('2 properties');
    });

    it('gives every node a type badge', () => {
        show(view);

        expect(document.querySelectorAll('.tree-row__badge--string').length).toBeGreaterThan(0);
        expect(document.querySelectorAll('.tree-row__badge--number')).toHaveLength(1);
    });

    it('draws one guide rail per level of depth', () => {
        show(view);

        expect(rowFor('name').querySelectorAll('.tree-row__indent i')).toHaveLength(1);
        expect(rowFor('first').querySelectorAll('.tree-row__indent i')).toHaveLength(2);
    });

    it('empties when the document goes away', () => {
        show(view);
        view.setDocument(null);

        expect(rows()).toHaveLength(0);
        expect(document.getElementById('visual-panel')?.hasAttribute('data-empty')).toBe(true);
    });

    describe('folding', () => {
        it('collapses a container from its twisty', () => {
            show(view);
            rowFor('author').querySelector<HTMLElement>('.tree-row__twisty')?.click();

            expect(texts().some(text => text.startsWith('first'))).toBe(false);
            expect(rowFor('author')).toBeTruthy();
        });

        /*
         * Selecting used to rebuild the whole viewport, which replaced the
         * element the click came from -- so the fold handler that ran next
         * looked at a detached node and did nothing at all.
         */
        it('still folds when the click also selects the row', () => {
            show(view);
            const before = rows().length;
            rowFor('tags').querySelector<HTMLElement>('.tree-row__twisty')?.click();

            expect(rows().length).toBe(before - 2);
            expect(selected()?.textContent).toContain('tags');
        });

        it('reopens what it closed', () => {
            show(view);
            const before = rows().length;

            rowFor('tags').querySelector<HTMLElement>('.tree-row__twisty')?.click();
            rowFor('tags').querySelector<HTMLElement>('.tree-row__twisty')?.click();

            expect(rows()).toHaveLength(before);
        });

        it('leaves only the root after collapsing everything', () => {
            show(view);
            document.getElementById('visual-collapse-all')?.click();

            expect(rows()).toHaveLength(1);
            expect(rows()[0].textContent).toContain('root');
        });

        it('opens to a given depth and no further', () => {
            show(view);
            view.expandToDepth(2);

            // `author` is open, but `roles` inside it is not.
            expect(texts().some(text => text.startsWith('first'))).toBe(true);
            expect(texts().some(text => text.includes('"admin"'))).toBe(false);
        });
    });

    describe('selection', () => {
        it('marks the clicked node and shows its path', () => {
            show(view);
            rowFor('first').click();

            expect(selected()?.textContent).toContain('first');
            expect(breadcrumb()).toBe('root›author›first');
        });

        it('moves the mark rather than adding another', () => {
            show(view);
            rowFor('first').click();
            rowFor('name').click();

            expect(document.querySelectorAll('.tree-row.is-selected')).toHaveLength(1);
        });

        it('numbers an array element in the breadcrumb', () => {
            show(view);
            rowWith('"safe"').click();

            expect(breadcrumb()).toBe('root›tags›1');
        });

        /*
         * Copy path, copy value and copy subtree used to sit in the pane header
         * beside the controls that reshape the whole document, three of twelve
         * buttons, with nothing to say they needed a node picked first. They now
         * live on the bar that names the node they act on, and appear with it.
         */
        it('offers the node actions only once a node is chosen', () => {
            show(view);
            expect(nodeActionsShown()).toBe(false);

            rowFor('first').click();
            expect(nodeActionsShown()).toBe(true);
        });

        it('withdraws them when the document is replaced', () => {
            show(view);
            rowFor('first').click();
            view.setDocument(null);

            expect(nodeActionsShown()).toBe(false);
        });

        it('keeps every copy action working from its new home', () => {
            show(view);
            rowFor('first').click();

            for (const id of ['visual-copy-path', 'visual-copy-value', 'visual-copy-subtree']) {
                const control = document.getElementById(id);
                expect(control).not.toBeNull();
                expect(
                    document.getElementById('visual-breadcrumb')?.contains(control)
                ).toBe(true);
            }
        });

        it('steps down and up', () => {
            show(view);
            view.step(1);
            expect(selected()?.textContent).toContain('root');

            view.step(1);
            expect(selected()?.textContent).toContain('name');

            view.step(-1);
            expect(selected()?.textContent).toContain('root');
        });

        it('stops at the ends rather than wrapping', () => {
            show(view);
            view.step(-1);
            view.step(-1);

            expect(selected()?.textContent).toContain('root');
        });

        it('closes an open node, then steps out to its parent', () => {
            show(view);
            rowFor('roles').click();

            view.stepAcross(-1);
            expect(texts().some(text => text.includes('"admin"'))).toBe(false);

            view.stepAcross(-1);
            expect(selected()?.textContent).toContain('author');
        });

        it('opens a closed node, then steps into it', () => {
            show(view);
            rowFor('tags').querySelector<HTMLElement>('.tree-row__twisty')?.click();

            view.stepAcross(1);
            expect(texts().some(text => text.includes('"fast"'))).toBe(true);

            view.stepAcross(1);
            expect(selected()?.textContent).toContain('"fast"');
        });

        it('does nothing sideways on a leaf', () => {
            show(view);
            rowFor('name').click();
            view.stepAcross(1);

            expect(selected()?.textContent).toContain('name');
        });
    });

    describe('copying', () => {
        let written: string[];

        beforeEach(() => {
            written = [];
            Object.defineProperty(navigator, 'clipboard', {
                value: {
                    writeText: (text: string) => {
                        written.push(text);
                        return Promise.resolve();
                    }
                },
                configurable: true
            });
        });

        it('copies the path of the selected node', () => {
            show(view);
            rowFor('first').click();
            view.copyPath();

            expect(written).toEqual(['$.author.first']);
        });

        it('copies a scalar value as written', () => {
            show(view);
            rowFor('name').click();
            view.copyValue();

            expect(written).toEqual(['"JSONBro"']);
        });

        it('copies a container value as valid JSON', () => {
            show(view);
            rowFor('tags').click();
            view.copyValue();

            expect(JSON.parse(written[0])).toEqual(['fast', 'safe']);
        });

        it('copies a subtree with its property name', () => {
            show(view);
            rowFor('tags').click();
            view.copySubtree();

            expect(written[0]).toBe('"tags": [\n  "fast",\n  "safe"\n]');
        });

        it('copies nothing when no node is selected', () => {
            show(view);
            view.copyPath();

            expect(written).toEqual([]);
        });
    });
});

/*
 * The two shapes draw the same document and read the same fold state, so what
 * matters is that neither can drift away from the other.
 */
describe('VisualView shapes', () => {
    let view: VisualView;

    const gnodes = () =>
        Array.from(document.querySelectorAll<SVGGElement>('.graph__node'));
    const gnodeFor = (text: string) =>
        gnodes().find(node => node.textContent?.includes(text)) as SVGGElement;
    const panel = () => document.getElementById('visual-panel') as HTMLElement;

    beforeEach(() => {
        mountPanel('format');
        view = new VisualView(new Messenger());
        show(view);
    });

    afterEach(() => {
        view.dispose();
    });

    it('starts as a tree', () => {
        expect(view.currentShape).toBe('tree');
        expect(panel().dataset.shape).toBe('tree');
    });

    it('draws a box per node and a link per parent when switched to graph', () => {
        view.setShape('graph');

        expect(panel().dataset.shape).toBe('graph');
        expect(gnodes()).toHaveLength(rows().length);
        expect(document.querySelectorAll('.graph__edge')).toHaveLength(rows().length - 1);
    });

    it('gives a container a twisty and a leaf none', () => {
        view.setShape('graph');

        const tagsLine = gnodeFor('tags').dataset.graphLine;
        const nameLine = gnodeFor('JSONBro').dataset.graphLine;

        expect(document.querySelector(`[data-graph-toggle="${tagsLine}"]`)).not.toBeNull();
        expect(document.querySelector(`[data-graph-toggle="${nameLine}"]`)).toBeNull();
    });

    it('folds from the graph, and the tree agrees', () => {
        view.setShape('graph');
        const line = gnodeFor('tags').dataset.graphLine;

        document
            .querySelector(`[data-graph-toggle="${line}"]`)
            ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(gnodes().some(node => node.textContent?.includes('"fast"'))).toBe(false);

        view.setShape('tree');
        expect(texts().some(text => text.includes('"fast"'))).toBe(false);
    });

    it('folds from the tree, and the graph agrees', () => {
        rowFor('author').querySelector<HTMLElement>('.tree-row__twisty')?.click();
        view.setShape('graph');

        expect(gnodes().some(node => node.textContent?.includes('first'))).toBe(false);
    });

    it('selects from the graph, and the tree and breadcrumb agree', () => {
        view.setShape('graph');
        gnodeFor('first').dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(breadcrumb()).toBe('root›author›first');
        expect(document.querySelector('.graph__node.is-selected')).not.toBeNull();

        view.setShape('tree');
        expect(selected()?.textContent).toContain('first');
    });

    it('copies from whichever shape is showing', () => {
        const written: string[] = [];
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: (text: string) => {
                    written.push(text);
                    return Promise.resolve();
                }
            },
            configurable: true
        });

        view.setShape('graph');
        gnodeFor('first').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        view.copyPath();

        expect(written).toEqual(['$.author.first']);
    });

    it('shows nothing at all once the document goes away', () => {
        view.setShape('graph');
        view.setDocument(null);

        expect(gnodes()).toHaveLength(0);
    });
});

/*
 * In this mode the left pane shows the formatted document rather than the box
 * it was pasted into: here it is something to read, and editing it would leave
 * the picture describing older text.
 */
describe('the source beside the picture', () => {
    let view: VisualView;

    const sourceRows = () => document.querySelectorAll('#input-view .json-line');

    beforeEach(() => {
        mountPanel('format');
        view = new VisualView(new Messenger());
    });

    afterEach(() => {
        view.dispose();
    });

    it('renders the same document as formatted lines', () => {
        show(view);
        expect(sourceRows().length).toBeGreaterThan(1);
    });

    it('colours it, rather than showing plain text', () => {
        show(view);
        expect(document.querySelectorAll('#input-view .key').length).toBeGreaterThan(0);
    });

    it('has no editable field of its own', () => {
        show(view);
        expect(document.querySelector('#input-view textarea')).toBeNull();
    });

    it('follows the selection, so the text and the picture agree', () => {
        show(view);
        rowFor('first').click();

        expect(document.querySelector('#input-view .json-line.is-selected')?.textContent).toContain(
            'first'
        );
    });

    it('empties with the document', () => {
        show(view);
        view.setDocument(null);

        expect(sourceRows()).toHaveLength(0);
    });
});

/*
 * The find control used to belong to the format view, so the picture could not
 * be searched at all. It drives whichever view is showing now, and a hit is
 * shown as the node it falls on rather than as a position in text.
 */
describe('searching the picture', () => {
    let view: VisualView;

    const search = (term: string) => view.searchable.search(term, { matchCase: false, regex: false, scope: 'all' });

    beforeEach(() => {
        mountPanel('format');
        view = new VisualView(new Messenger());
        show(view);
    });

    afterEach(() => {
        view.dispose();
    });

    it('finds every hit in the document', () => {
        expect(search('admin')).toBe(1);
        expect(search('a')).toBeGreaterThan(1);
    });

    it('marks the rows that hold a hit', () => {
        search('Ada');
        expect(document.querySelectorAll('.tree-row.is-match').length).toBeGreaterThan(0);
    });

    it('selects the first hit and shows where it is', () => {
        search('Ada');

        expect(selected()?.textContent).toContain('first');
        expect(breadcrumb()).toBe('root›author›first');
    });

    it('steps between hits', () => {
        search('a');
        const first = document.querySelector('.tree-row.is-current-match')?.textContent;

        view.searchable.next();

        expect(document.querySelector('.tree-row.is-current-match')?.textContent).not.toBe(first);
    });

    it('opens a fold that was hiding a hit', () => {
        document.getElementById('visual-collapse-all')?.click();
        expect(rows()).toHaveLength(1);

        search('admin');

        expect(texts().some(text => text.includes('"admin"'))).toBe(true);
    });

    it('reports how many it found', () => {
        search('Ada');
        expect(view.searchable.position()).toEqual(
            expect.objectContaining({ current: 1, total: 1 })
        );
    });

    it('clears the marks', () => {
        search('Ada');
        view.searchable.clear();

        expect(document.querySelectorAll('.tree-row.is-match')).toHaveLength(0);
    });

    it('finds nothing in an empty view rather than throwing', () => {
        view.setDocument(null);
        expect(search('anything')).toBe(0);
    });
});

/*
 * Making a change used to mean leaving for the Format tab and coming back,
 * because the pane beside the picture was read-only with no way out of it.
 */
describe('editing beside the picture', () => {
    let view: VisualView;

    beforeEach(() => {
        jest.useFakeTimers();
        mountPanel('format');
        view = new VisualView(new Messenger());
        show(view);
        view.activate();
    });

    afterEach(() => {
        view.dispose();
        jest.useRealTimers();
    });

    it('starts as something to read', () => {
        expect(document.getElementById('input-panel')?.dataset.input).toBe('source');
    });

    it('swaps to the editable box and back', () => {
        document.getElementById('edit-input')?.click();
        expect(document.getElementById('input-panel')?.dataset.input).toBe('edit');

        document.getElementById('edit-input')?.click();
        expect(document.getElementById('input-panel')?.dataset.input).toBe('source');
    });

    it('rebuilds the picture after a pause in typing', () => {
        const rebuilds = jest.fn();
        view.onRebuildRequested = rebuilds;
        document.getElementById('edit-input')?.click();

        const field = document.getElementById('input') as HTMLTextAreaElement;
        field.value = '{"other":1}';
        field.dispatchEvent(new Event('input', { bubbles: true }));

        expect(rebuilds).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1000);
        expect(rebuilds).toHaveBeenCalledTimes(1);
    });

    /* A burst of typing is one rebuild, not one per keystroke. */
    it('rebuilds once for a burst of typing', () => {
        const rebuilds = jest.fn();
        view.onRebuildRequested = rebuilds;
        const field = document.getElementById('input') as HTMLTextAreaElement;

        for (const text of ['{', '{"a', '{"a":', '{"a":1}']) {
            field.value = text;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            jest.advanceTimersByTime(50);
        }
        jest.advanceTimersByTime(1000);

        expect(rebuilds).toHaveBeenCalledTimes(1);
    });
});

describe('formatPath', () => {
    it('uses dots for names that need no quoting', () => {
        expect(formatPath(['author', 'first'])).toBe('$.author.first');
    });

    it('uses brackets for array positions', () => {
        expect(formatPath(['rows', '3', 'id'])).toBe('$.rows[3].id');
    });

    it('quotes a name that is not an identifier', () => {
        expect(formatPath(['a b'])).toBe('$["a b"]');
        expect(formatPath(['with.dot'])).toBe('$["with.dot"]');
    });

    it('describes the root as itself', () => {
        expect(formatPath([])).toBe('$');
    });
});
