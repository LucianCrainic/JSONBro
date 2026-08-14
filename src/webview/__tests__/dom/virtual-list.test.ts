import { VirtualList } from '../../ui/virtual-list';

const ROW_HEIGHT = 20;

/**
 * jsdom reports every element as zero-sized, so geometry has to be supplied.
 * Rows get a fixed height and the viewport a fixed window.
 */
function stubGeometry(viewportHeight = 200): void {
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
        configurable: true,
        get(this: HTMLElement) {
            if (this.classList.contains('row')) {
                return ROW_HEIGHT;
            }
            if (this.classList.contains('vlist__spacer')) {
                return parseFloat(this.style.height) || 0;
            }
            return 0;
        }
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
        configurable: true,
        get(this: HTMLElement) {
            return this.classList.contains('vlist') ? viewportHeight : 0;
        }
    });
}

function makeList(count: number, viewportHeight = 200) {
    stubGeometry(viewportHeight);

    const viewport = document.createElement('div');
    document.body.appendChild(viewport);

    const rendered: Array<[number, number]> = [];
    const list = new VirtualList({
        viewport,
        count: () => count,
        renderRows: (from, to) => {
            rendered.push([from, to]);
            let html = '';
            for (let i = from; i < to; i++) {
                html += `<div class="row" data-row="${i}">row ${i}</div>`;
            }
            return html;
        },
        overscan: 2
    });

    return { list, viewport, rendered };
}

function rowsOnScreen(viewport: HTMLElement): number[] {
    return Array.from(viewport.querySelectorAll<HTMLElement>('.row')).map(row =>
        Number(row.dataset.row)
    );
}

describe('VirtualList', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('renders only what the window can show, plus overscan', () => {
        const { list, viewport } = makeList(10_000);
        list.refresh();

        const rows = rowsOnScreen(viewport);
        // 200px viewport / 20px rows = 10 visible, plus 2 overscan either side.
        expect(rows.length).toBeLessThan(20);
        expect(rows[0]).toBe(0);
    });

    it('sizes the spacer to the whole document', () => {
        const { list, viewport } = makeList(1000);
        list.refresh();

        const spacer = viewport.querySelector<HTMLElement>('.vlist__spacer');
        expect(spacer?.style.height).toBe(`${1000 * ROW_HEIGHT}px`);
    });

    it('renders a different range once scrolled', () => {
        const { list, viewport } = makeList(10_000);
        list.refresh();

        viewport.scrollTop = 100 * ROW_HEIGHT;
        list.refresh();

        const rows = rowsOnScreen(viewport);
        expect(rows[0]).toBe(98); // 100 less the overscan
        expect(viewport.querySelector<HTMLElement>('.vlist__window')?.style.transform).toBe(
            `translateY(${98 * ROW_HEIGHT}px)`
        );
    });

    it('handles an empty document', () => {
        const { list, viewport } = makeList(0);
        list.refresh();

        expect(rowsOnScreen(viewport)).toHaveLength(0);
        expect(viewport.querySelector<HTMLElement>('.vlist__spacer')?.style.height).toBe('0px');
    });

    it('does not run past the end of the document', () => {
        const { list, viewport } = makeList(5);
        list.refresh();

        expect(rowsOnScreen(viewport)).toEqual([0, 1, 2, 3, 4]);
    });

    it('scrolls a row into view', () => {
        const { list, viewport } = makeList(10_000);
        list.refresh();

        list.revealRow(500);

        expect(viewport.scrollTop).toBeGreaterThan(0);
        expect(rowsOnScreen(viewport)).toContain(500);
    });

    it('leaves a row already on screen where it is', () => {
        const { list, viewport } = makeList(10_000);
        list.refresh();

        list.revealRow(3);

        expect(viewport.scrollTop).toBe(0);
    });

    /*
     * Browsers stop scrolling elements past about 33 million pixels, which a
     * large JSON file reaches well before memory does. Past that the spacer is
     * capped and the scroll position maps onto the row range by proportion.
     */
    describe('documents taller than the browser will scroll', () => {
        const HUGE = 5_000_000; // 100 million pixels at 20px a row

        it('caps the spacer height', () => {
            const { list, viewport } = makeList(HUGE);
            list.refresh();

            const height = parseFloat(
                viewport.querySelector<HTMLElement>('.vlist__spacer')?.style.height ?? '0'
            );
            expect(height).toBeLessThanOrEqual(30_000_000);
            expect(height).toBeGreaterThan(0);
        });

        it('still reaches the last row', () => {
            const { list, viewport } = makeList(HUGE);
            list.refresh();

            const spacer = viewport.querySelector<HTMLElement>('.vlist__spacer');
            viewport.scrollTop = parseFloat(spacer?.style.height ?? '0');
            list.refresh();

            expect(rowsOnScreen(viewport)).toContain(HUGE - 1);
        });

        it('reaches the middle', () => {
            const { list, viewport } = makeList(HUGE);
            list.refresh();

            const spacer = viewport.querySelector<HTMLElement>('.vlist__spacer');
            viewport.scrollTop = parseFloat(spacer?.style.height ?? '0') / 2;
            list.refresh();

            const rows = rowsOnScreen(viewport);
            expect(rows[0]).toBeGreaterThan(HUGE * 0.45);
            expect(rows[0]).toBeLessThan(HUGE * 0.55);
        });

        it('reveals a specific row', () => {
            const { list, viewport } = makeList(HUGE);
            list.refresh();

            list.revealRow(4_000_000);

            expect(rowsOnScreen(viewport)).toContain(4_000_000);
        });
    });
});
