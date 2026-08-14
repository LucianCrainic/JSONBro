/**
 * The find widget that floats over the formatted output.
 *
 * Modelled on the editor's own find control: it anchors to the top-right of
 * the content it searches, rather than living in the toolbar where it had to
 * swap places with the button that opened it.
 *
 * It no longer searches anything itself. Matching moved to the document model,
 * because with rows rendered only while visible there is no DOM to walk -- and
 * because walking it was what made searching a large document slow.
 */
import { InvalidPatternError, type SearchOptions, type SearchScope } from '../engine/document-search';
import { byId, on, qsa } from './dom';

export interface FindPosition {
    current: number;
    total: number;
    /** True when matching stopped at its limit rather than at the end. */
    truncated?: boolean;
}

export interface FindWidgetOptions {
    /**
     * Called before opening or searching. Returns false when there is nothing
     * to search, which lets the caller format first instead of no-opping.
     */
    ensureSearchable: () => boolean;
    /** Runs a search, returning how many matches it found. */
    search: (term: string, options: SearchOptions) => number;
    next: () => void;
    previous: () => void;
    clear: () => void;
    position: () => FindPosition;
}

interface FindState {
    term: string;
    matchCase: boolean;
    regex: boolean;
    scope: SearchScope;
}

/**
 * How long typing pauses before a search runs.
 *
 * Searching ran straight off the input event before, so every keystroke
 * re-searched and re-rendered the whole document.
 */
const DEBOUNCE_MS = 120;

export class FindWidget {
    private readonly options: FindWidgetOptions;
    private readonly teardown: Array<() => void> = [];

    private readonly widget: HTMLElement | null;
    private readonly input: HTMLInputElement | null;
    private readonly count: HTMLElement | null;
    private readonly prevButton: HTMLButtonElement | null;
    private readonly nextButton: HTMLButtonElement | null;

    private debounce: ReturnType<typeof setTimeout> | null = null;

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
                    this.runDebounced();
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
        this.cancelPending();
        this.widget.hidden = true;
        this.options.clear();
        byId('output')?.focus();
    }

    public toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /** Sets the scope new searches start with, from configuration. */
    public setDefaultScope(scope: SearchScope): void {
        this.state.scope = scope;
        this.syncScopeButtons();
    }

    /** Re-runs the current search, e.g. after the document was re-rendered. */
    public refresh(): void {
        if (this.isOpen) {
            this.run();
        }
    }

    /** Drops matches and the stored term without closing. */
    public reset(): void {
        this.cancelPending();
        this.state.term = '';
        if (this.input) {
            this.input.value = '';
        }
        this.options.clear();
        this.report();
    }

    public dispose(): void {
        this.cancelPending();
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }

    private cancelPending(): void {
        if (this.debounce !== null) {
            clearTimeout(this.debounce);
            this.debounce = null;
        }
    }

    private runDebounced(): void {
        this.cancelPending();
        this.debounce = setTimeout(() => {
            this.debounce = null;
            this.run();
        }, DEBOUNCE_MS);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === 'Enter') {
            event.preventDefault();
            // Commit typing that has not been searched yet, so Enter acts on
            // what is in the box. Re-running unconditionally would reset the
            // position to the first match on every press.
            if (this.debounce !== null) {
                this.cancelPending();
                this.run();
            }
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
        const term = this.state.term.trim();
        if (!term) {
            this.options.clear();
            this.report();
            return;
        }

        try {
            this.options.search(term, {
                matchCase: this.state.matchCase,
                regex: this.state.regex,
                scope: this.state.scope
            });
            this.report();
        } catch (error) {
            this.options.clear();
            if (error instanceof InvalidPatternError) {
                this.report('Invalid pattern');
            } else {
                console.error('Error performing search:', error);
                this.report('Search failed');
            }
        }
    }

    private next(): void {
        this.options.next();
        this.report();
    }

    private previous(): void {
        this.options.previous();
        this.report();
    }

    /** Updates the counter and the enabled state of the navigation buttons. */
    private report(error?: string): void {
        const { current, total, truncated } = this.options.position();

        if (this.count) {
            this.count.classList.toggle('is-error', Boolean(error));
            if (error) {
                this.count.textContent = error;
            } else if (!this.state.term.trim()) {
                this.count.textContent = '';
            } else if (total === 0) {
                this.count.textContent = 'No results';
            } else {
                this.count.textContent = `${current} of ${total.toLocaleString()}${
                    truncated ? '+' : ''
                }`;
            }
        }

        const disabled = total === 0;
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
