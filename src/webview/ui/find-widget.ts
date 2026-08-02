/**
 * The find widget that floats over the formatted output.
 *
 * Modelled on the editor's own find control: it anchors to the top-right of
 * the content it searches, rather than living in the toolbar where it had to
 * swap places with the button that opened it.
 */
import { InvalidPatternError, JSONSearch, type SearchScope } from '../search';
import { byId, on, qsa } from './dom';

export interface FindWidgetOptions {
    /** The element to search within, resolved lazily so re-renders are picked up. */
    target: () => HTMLElement | null;
    /**
     * Called before opening or searching. Returns false when there is nothing
     * to search, which lets the caller format first instead of no-opping.
     */
    ensureSearchable: () => boolean;
}

interface FindState {
    term: string;
    matchCase: boolean;
    regex: boolean;
    scope: SearchScope;
}

export class FindWidget {
    private readonly search = new JSONSearch();
    private readonly options: FindWidgetOptions;
    private readonly teardown: Array<() => void> = [];

    private readonly widget: HTMLElement | null;
    private readonly input: HTMLInputElement | null;
    private readonly count: HTMLElement | null;
    private readonly prevButton: HTMLButtonElement | null;
    private readonly nextButton: HTMLButtonElement | null;

    /** Kept across close/open so reopening resumes the previous search. */
    private state: FindState = { term: '', matchCase: false, regex: false, scope: 'all' };

    constructor(options: FindWidgetOptions) {
        this.options = options;
        this.widget = byId('find-widget');
        this.input = byId<HTMLInputElement>('find-input');
        this.count = byId('find-count');
        this.prevButton = byId<HTMLButtonElement>('find-prev');
        this.nextButton = byId<HTMLButtonElement>('find-next');

        this.wire();
    }

    public get isOpen(): boolean {
        return this.widget?.hidden === false;
    }

    private wire(): void {
        if (this.input) {
            this.teardown.push(
                on(this.input, 'input', () => {
                    this.state.term = this.input?.value ?? '';
                    this.run();
                }),
                on(this.input, 'keydown', event => this.onKeyDown(event))
            );
        }

        const bind = (id: string, handler: () => void) => {
            const element = byId(id);
            if (element) {
                this.teardown.push(on(element, 'click', handler));
            }
        };
        bind('find-next', () => this.next());
        bind('find-prev', () => this.previous());
        bind('find-close', () => this.close());

        for (const button of qsa<HTMLElement>('[data-find-option]')) {
            this.teardown.push(
                on(button, 'click', () => {
                    const option = button.dataset.findOption as 'matchCase' | 'regex';
                    this.state[option] = !this.state[option];
                    this.syncOptionButtons();
                    this.run();
                })
            );
        }

        for (const button of qsa<HTMLElement>('[data-find-scope]')) {
            this.teardown.push(
                on(button, 'click', () => {
                    this.state.scope = button.dataset.findScope as SearchScope;
                    this.syncScopeButtons();
                    this.run();
                })
            );
        }
    }

    /**
     * Opens the widget.
     *
     * Previously the search control silently did nothing until something had
     * been formatted; now the caller gets a chance to format first.
     */
    public open(): void {
        if (!this.widget || !this.options.ensureSearchable()) {
            return;
        }

        this.widget.hidden = false;
        this.syncOptionButtons();
        this.syncScopeButtons();

        if (this.input) {
            this.input.value = this.state.term;
            this.input.focus();
            this.input.select();
        }

        this.run();
    }

    public close(): void {
        if (!this.widget) {
            return;
        }
        this.widget.hidden = true;
        this.clearHighlights();
        this.options.target()?.focus();
    }

    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /** Re-runs the current search, e.g. after the output was re-rendered. */
    public refresh(): void {
        if (this.isOpen) {
            this.run();
        }
    }

    /** Drops highlights and the stored term without closing. */
    public reset(): void {
        this.state.term = '';
        if (this.input) {
            this.input.value = '';
        }
        this.clearHighlights();
        this.report(0);
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }

    private clearHighlights(): void {
        const target = this.options.target();
        if (target) {
            this.search.clearHighlights(target);
        }
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
        if (!target) {
            return;
        }

        const term = this.state.term.trim();
        if (!term) {
            this.clearHighlights();
            this.report(0);
            return;
        }

        try {
            const matches = this.search.search(term, target, {
                matchCase: this.state.matchCase,
                regex: this.state.regex,
                scope: this.state.scope
            });
            this.report(matches);
        } catch (error) {
            if (error instanceof InvalidPatternError) {
                this.report(0, 'Invalid pattern');
            } else {
                console.error('Error performing search:', error);
                this.report(0, 'Search failed');
            }
        }
    }

    private next(): void {
        this.search.nextMatch();
        this.report();
    }

    private previous(): void {
        this.search.previousMatch();
        this.report();
    }

    /** Updates the counter and the enabled state of the navigation buttons. */
    private report(matches?: number, error?: string): void {
        const { current, total } = this.search.getCurrentMatchInfo();
        const count = matches ?? total;

        if (this.count) {
            this.count.classList.toggle('is-error', Boolean(error));
            if (error) {
                this.count.textContent = error;
            } else if (!this.state.term.trim()) {
                this.count.textContent = '';
            } else {
                this.count.textContent = count === 0 ? 'No results' : `${current} of ${total}`;
            }
        }

        const disabled = count === 0;
        if (this.prevButton) {
            this.prevButton.disabled = disabled;
        }
        if (this.nextButton) {
            this.nextButton.disabled = disabled;
        }
    }

    private syncOptionButtons(): void {
        for (const button of qsa<HTMLElement>('[data-find-option]')) {
            const option = button.dataset.findOption as 'matchCase' | 'regex';
            const active = this.state[option];
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        }
    }

    private syncScopeButtons(): void {
        for (const button of qsa<HTMLElement>('[data-find-scope]')) {
            const active = button.dataset.findScope === this.state.scope;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        }
    }
}
