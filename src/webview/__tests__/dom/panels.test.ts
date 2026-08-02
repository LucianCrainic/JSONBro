import { PanelGroup } from '../../ui/panels';

const MAXIMIZE_PATH = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
const RESTORE_PATH = 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z';

function buildLayout(): { container: HTMLElement; splitter: HTMLElement } {
    document.body.innerHTML = `
        <div id="container">
            <div id="pane-a">
                <button class="maximize-btn" data-maximize="pane-a">
                    <svg><path d="${MAXIMIZE_PATH}"/></svg>
                </button>
            </div>
            <div id="splitter"></div>
            <div id="pane-b">
                <button class="maximize-btn" data-maximize="pane-b">
                    <svg><path d="${MAXIMIZE_PATH}"/></svg>
                </button>
            </div>
        </div>`;
    return {
        container: document.getElementById('container') as HTMLElement,
        splitter: document.getElementById('splitter') as HTMLElement
    };
}

function clickMaximize(panelId: string): void {
    document.querySelector<HTMLElement>(`[data-maximize="${panelId}"]`)?.click();
}

function pathOf(panelId: string): string | null | undefined {
    return document
        .querySelector(`[data-maximize="${panelId}"] svg path`)
        ?.getAttribute('d');
}

describe('PanelGroup', () => {
    let group: PanelGroup;
    let splitter: HTMLElement;

    beforeEach(() => {
        const layout = buildLayout();
        splitter = layout.splitter;
        group = new PanelGroup({
            container: layout.container,
            panelIds: ['pane-a', 'pane-b'],
            collapsible: splitter
        });
    });

    afterEach(() => {
        group.dispose();
    });

    it('maximizes the clicked pane and minimizes the others', () => {
        clickMaximize('pane-a');

        expect(document.getElementById('pane-a')?.classList.contains('panel-maximized')).toBe(true);
        expect(document.getElementById('pane-b')?.classList.contains('panel-minimized')).toBe(true);
        expect(group.maximizedPanel).toBe('pane-a');
    });

    it('restores when the same pane is clicked again', () => {
        clickMaximize('pane-a');
        clickMaximize('pane-a');

        for (const id of ['pane-a', 'pane-b']) {
            const panel = document.getElementById(id) as HTMLElement;
            expect(panel.classList.contains('panel-maximized')).toBe(false);
            expect(panel.classList.contains('panel-minimized')).toBe(false);
        }
        expect(group.maximizedPanel).toBeNull();
    });

    it('moves the maximized pane when a different one is clicked', () => {
        clickMaximize('pane-a');
        clickMaximize('pane-b');

        expect(document.getElementById('pane-b')?.classList.contains('panel-maximized')).toBe(true);
        expect(document.getElementById('pane-a')?.classList.contains('panel-minimized')).toBe(true);
        expect(group.maximizedPanel).toBe('pane-b');
    });

    it('hides the collapsible element while a pane is maximized', () => {
        clickMaximize('pane-a');
        expect(splitter.classList.contains('hidden')).toBe(true);

        clickMaximize('pane-a');
        expect(splitter.classList.contains('hidden')).toBe(false);
    });

    it('swaps the icon on the maximized pane only', () => {
        clickMaximize('pane-a');

        expect(pathOf('pane-a')).toBe(RESTORE_PATH);
        expect(pathOf('pane-b')).toBe(MAXIMIZE_PATH);

        clickMaximize('pane-a');
        expect(pathOf('pane-a')).toBe(MAXIMIZE_PATH);
    });

    it('clears explicit sizing left behind by a splitter drag', () => {
        const paneA = document.getElementById('pane-a') as HTMLElement;
        paneA.style.width = '400px';
        paneA.style.flexGrow = '0';

        clickMaximize('pane-a');

        expect(paneA.style.width).toBe('');
        expect(paneA.style.flexGrow).toBe('');
    });

    /*
     * The previous implementation re-bound buttons on every mode switch and
     * cloned each node to shed its old listener, so handlers attached by other
     * code were silently dropped. Delegation must survive re-registration.
     */
    it('keeps working after the buttons are re-rendered', () => {
        const paneA = document.getElementById('pane-a') as HTMLElement;
        paneA.innerHTML = `
            <button class="maximize-btn" data-maximize="pane-a">
                <svg><path d="${MAXIMIZE_PATH}"/></svg>
            </button>`;

        clickMaximize('pane-a');

        expect(group.maximizedPanel).toBe('pane-a');
        expect(paneA.classList.contains('panel-maximized')).toBe(true);
    });

    it('stops responding after dispose', () => {
        group.dispose();
        clickMaximize('pane-a');
        expect(group.maximizedPanel).toBeNull();
    });
});
