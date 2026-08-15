import { PanelGroup } from '../../ui/panels';

const maximizeButton = (panelId: string) =>
    `<button class="icon-btn" data-maximize="${panelId}">
        <span class="codicon codicon-screen-full"></span>
    </button>`;

function buildLayout(): { container: HTMLElement; splitter: HTMLElement } {
    document.body.innerHTML = `
        <div id="container">
            <div id="pane-a">${maximizeButton('pane-a')}</div>
            <div id="splitter"></div>
            <div id="pane-b">${maximizeButton('pane-b')}</div>
        </div>`;
    return {
        container: document.getElementById('container') as HTMLElement,
        splitter: document.getElementById('splitter') as HTMLElement
    };
}

function clickMaximize(panelId: string): void {
    document.querySelector<HTMLElement>(`[data-maximize="${panelId}"]`)?.click();
}

function iconOf(panelId: string): DOMTokenList | undefined {
    return document.querySelector(`[data-maximize="${panelId}"] .codicon`)?.classList;
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

        expect(iconOf('pane-a')?.contains('codicon-screen-normal')).toBe(true);
        expect(iconOf('pane-a')?.contains('codicon-screen-full')).toBe(false);
        expect(iconOf('pane-b')?.contains('codicon-screen-full')).toBe(true);

        clickMaximize('pane-a');
        expect(iconOf('pane-a')?.contains('codicon-screen-full')).toBe(true);
    });

    it('keeps the accessible name in step with the icon', () => {
        const button = document.querySelector('[data-maximize="pane-a"]') as HTMLElement;

        clickMaximize('pane-a');
        expect(button.getAttribute('aria-label')).toBe('Restore panel');

        clickMaximize('pane-a');
        expect(button.getAttribute('aria-label')).toBe('Maximize panel');
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
        paneA.innerHTML = maximizeButton('pane-a');

        clickMaximize('pane-a');

        expect(group.maximizedPanel).toBe('pane-a');
        expect(paneA.classList.contains('panel-maximized')).toBe(true);
    });

    it('stops responding after dispose', () => {
        group.dispose();
        clickMaximize('pane-a');
        expect(group.maximizedPanel).toBeNull();
    });

    /*
     * Panes belonging to different modes share this group, since the formatted
     * output and the picture occupy the same slot in the row. A pane maximized
     * in one mode has to give that up when the other takes the screen, or its
     * minimized neighbours stay hidden and that mode shows nothing at all.
     */
    describe('when the mode changes', () => {
        beforeEach(() => {
            document.body.dataset.mode = 'visual';
            (document.getElementById('pane-b') as HTMLElement).dataset.modeOnly = 'visual';
        });

        it('gives up a maximized pane the new mode does not show', () => {
            clickMaximize('pane-b');
            document.body.dataset.mode = 'format';

            group.restoreIfOutOfMode();

            expect(group.maximizedPanel).toBeNull();
            expect(document.getElementById('pane-a')?.classList.contains('panel-minimized')).toBe(
                false
            );
        });

        it('keeps one both modes show', () => {
            clickMaximize('pane-a');
            document.body.dataset.mode = 'format';

            group.restoreIfOutOfMode();

            expect(group.maximizedPanel).toBe('pane-a');
        });

        it('holds on while the pane is still on screen', () => {
            clickMaximize('pane-b');

            group.restoreIfOutOfMode();

            expect(group.maximizedPanel).toBe('pane-b');
        });
    });
});
