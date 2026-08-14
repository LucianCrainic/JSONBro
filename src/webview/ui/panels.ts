/**
 * Maximize/restore for a group of side-by-side panes.
 *
 * Uses one delegated listener on the container rather than binding each
 * button. The previous approach re-bound buttons on every mode switch and
 * cloned each node to shed its old listener, which silently discarded
 * listeners that other code had attached to the button's children.
 */
import { delegate, qsa } from './dom';
import { Icons } from './icons';
import { setTip } from './tooltip';

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
            const icon = button.querySelector('.codicon');
            icon?.classList.toggle(`codicon-${Icons.maximize}`, !isMaximized);
            icon?.classList.toggle(`codicon-${Icons.restore}`, isMaximized);

            const label = isMaximized ? 'Restore panel' : 'Maximize panel';
            setTip(button, label);
            button.setAttribute('aria-label', label);
        }
    }
}
