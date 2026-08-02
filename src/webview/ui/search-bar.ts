/**
 * The toolbar search bar, driving JSONSearch over the formatted output.
 */
import { JSONSearch } from '../search';
import { byId, on } from './dom';

export interface SearchBarOptions {
    /** The element to search within, resolved lazily so re-renders are picked up. */
    target: () => HTMLElement | null;
    /** Whether searching is currently possible; blocks opening when false. */
    canSearch: () => boolean;
}

export class SearchBar {
    private readonly search = new JSONSearch();
    private readonly options: SearchBarOptions;
    private readonly teardown: Array<() => void> = [];

    private container: HTMLElement | null;
    private toggleButton: HTMLElement | null;
    private input: HTMLInputElement | null;
    private info: HTMLElement | null;
    private nextButton: HTMLButtonElement | null;
    private prevButton: HTMLButtonElement | null;

    constructor(options: SearchBarOptions) {
        this.options = options;
        this.container = byId('search-container');
        this.toggleButton = byId('search-toggle');
        this.input = byId<HTMLInputElement>('search-input');
        this.info = byId('search-info');
        this.nextButton = byId<HTMLButtonElement>('search-next');
        this.prevButton = byId<HTMLButtonElement>('search-prev');

        if (this.toggleButton) {
            this.teardown.push(on(this.toggleButton, 'click', () => this.toggle()));
        }
        const closeButton = byId('search-close');
        if (closeButton) {
            this.teardown.push(on(closeButton, 'click', () => this.close()));
        }
        if (this.nextButton) {
            this.teardown.push(on(this.nextButton, 'click', () => this.next()));
        }
        if (this.prevButton) {
            this.teardown.push(on(this.prevButton, 'click', () => this.previous()));
        }
        if (this.input) {
            this.teardown.push(
                on(this.input, 'input', () => this.run()),
                on(this.input, 'keydown', event => this.onKeyDown(event))
            );
        }
    }

    public get isOpen(): boolean {
        return this.container?.hidden === false;
    }

    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    public open(): void {
        if (!this.container || !this.toggleButton || !this.options.canSearch()) {
            return;
        }
        this.container.hidden = false;
        this.toggleButton.hidden = true;
        this.input?.focus();
        this.input?.select();
    }

    public close(): void {
        if (!this.container || !this.toggleButton) {
            return;
        }
        this.container.hidden = true;
        this.toggleButton.hidden = false;
        this.clear();
    }

    /** Drops highlights without touching the bar's open/closed state. */
    public clear(): void {
        if (this.input) {
            this.input.value = '';
        }
        const target = this.options.target();
        if (target) {
            this.search.clearHighlights(target);
        }
        this.updateInfo();
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) {
                this.previous();
            } else {
                this.next();
            }
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.close();
        }
    }

    private run(): void {
        const target = this.options.target();
        if (!this.input || !target || !this.info) {
            return;
        }

        try {
            const term = this.input.value.trim();
            const matches = this.search.search(term, target);

            if (matches === 0) {
                this.info.textContent = term ? 'No matches' : '0 matches';
            } else {
                this.updateInfo();
            }

            if (this.nextButton && this.prevButton) {
                this.nextButton.disabled = matches === 0;
                this.prevButton.disabled = matches === 0;
            }
        } catch (error) {
            console.error('Error performing search:', error);
            this.info.textContent = 'Search error';
        }
    }

    private next(): void {
        this.search.nextMatch();
        this.updateInfo();
    }

    private previous(): void {
        this.search.previousMatch();
        this.updateInfo();
    }

    private updateInfo(): void {
        if (!this.info) {
            return;
        }
        const { current, total } = this.search.getCurrentMatchInfo();
        this.info.textContent = total > 0 ? `${current} of ${total} matches` : 'No matches';
    }
}
