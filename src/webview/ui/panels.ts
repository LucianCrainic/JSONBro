/**
 * Maximize/restore for a group of side-by-side panes.
 *
 * Uses one delegated listener on the container rather than binding each
 * button. The previous approach re-bound buttons on every mode switch and
 * cloned each node to shed its old listener, which silently discarded
 * listeners that other code had attached to the button's children.
 */
import { delegate, qsa } from './dom';

const ICON_MAXIMIZE = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
const ICON_RESTORE = 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z';

export interface PanelGroupOptions {
    /** Element containing the panes; the delegated listener lives here. */
    container: HTMLElement;
    /** Ids of the panes in this group. */
    panelIds: string[];
    /** Optional element hidden while a pane is maximized (e.g. the splitter). */
    collapsible?: HTMLElement | null;
    /** Called when a pane is maximized or restored. */
    onChange?: (maximized: string | null) => void;
}

export class PanelGroup {
    private readonly options: PanelGroupOptions;
    private readonly detach: () => void;
    private maximized: string | null = null;

    constructor(options: PanelGroupOptions) {
        this.options = options;
        this.detach = delegate(options.container, 'click', '[data-maximize]', button => {
            const panelId = button.getAttribute('data-maximize');
            if (panelId) {
                this.toggle(panelId);
            }
        });
    }

    public get maximizedPanel(): string | null {
        return this.maximized;
    }

    public toggle(panelId: string): void {
        this.maximized = this.maximized === panelId ? null : panelId;
        this.apply();
    }

    /** Restores every pane to its default size. */
    public restore(): void {
        this.maximized = null;
        this.apply();
    }

    public dispose(): void {
        this.detach();
    }

    private panels(): HTMLElement[] {
        return this.options.panelIds
            .map(id => document.getElementById(id))
            .filter((el): el is HTMLElement => el !== null);
    }

    private apply(): void {
        const panels = this.panels();
        if (panels.length === 0) {
            return;
        }

        for (const panel of panels) {
            panel.classList.remove('panel-maximized', 'panel-minimized');
            if (this.maximized) {
                panel.classList.add(
                    panel.id === this.maximized ? 'panel-maximized' : 'panel-minimized'
                );
            }
            // Explicit sizes from a splitter drag would otherwise fight the
            // maximize class, so clear them whenever the layout changes.
            panel.style.width = '';
            panel.style.flexBasis = '';
            panel.style.flexGrow = '';
            panel.style.flexShrink = '';
        }

        if (this.options.collapsible) {
            this.options.collapsible.classList.toggle('hidden', this.maximized !== null);
        }

        this.updateIcons();
        this.options.onChange?.(this.maximized);
    }

    private updateIcons(): void {
        for (const button of qsa<HTMLElement>('[data-maximize]', this.options.container)) {
            const isMaximized = button.getAttribute('data-maximize') === this.maximized;
            const path = button.querySelector('svg path');
            path?.setAttribute('d', isMaximized ? ICON_RESTORE : ICON_MAXIMIZE);
            button.setAttribute('title', isMaximized ? 'Restore panel' : 'Maximize panel');
        }
    }
}
