/**
 * The Format view: input textarea, formatted output, folding and search.
 */
import { JSONFormatter } from '../formatter';
import { JSONParser } from '../json-parser';
import { byId, delegate, on, qsa } from '../ui/dom';
import { Icons } from '../ui/icons';
import { PanelGroup } from '../ui/panels';
import { SearchBar } from '../ui/search-bar';
import { Splitter } from '../ui/splitter';
import { formatBytes, plural, type StatusModel } from '../ui/status-bar';
import type { Messenger } from '../ui/messaging';

export class FormatView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    private currentJson: unknown = null;
    private loadingFromHistory = false;
    private status: StatusModel = {};

    private splitter: Splitter | null = null;
    private panels: PanelGroup | null = null;
    public readonly search: SearchBar;

    /** Notifies the shell that the status model changed. */
    public onStatusChange: (status: StatusModel) => void = () => undefined;

    constructor(messenger: Messenger) {
        this.messenger = messenger;

        this.search = new SearchBar({
            target: () => byId('output'),
            canSearch: () => this.currentJson !== null
        });

        this.setupLayout();
        this.setupControls();
        this.setupCopyInterception();
        this.setupFolding();
    }

    // ---------------------------------------------------------------- layout

    private setupLayout(): void {
        const container = byId('format-container');
        const handle = byId('splitter');
        const before = byId('input-panel');
        const after = byId('output-panel');

        if (container && handle && before && after) {
            // Panes now sit edge to edge, so no container padding to subtract.
            this.splitter = new Splitter({ container, handle, before, after, padding: 0 });
            this.panels = new PanelGroup({
                container,
                panelIds: ['input-panel', 'output-panel'],
                collapsible: handle,
                // A maximized pane owns the full width, so any splitter sizing
                // is stale; drop it so restoring returns to the CSS default.
                onChange: maximized => {
                    if (maximized === null) {
                        this.splitter?.reset();
                    }
                }
            });
        }
    }

    /** Splits the panes, `ratio` being the share given to the input pane. */
    public setSplitRatio(ratio: number): void {
        this.splitter?.setRatio(ratio);
    }

    public focusInput(): void {
        byId<HTMLTextAreaElement>('input')?.focus();
    }

    // -------------------------------------------------------------- controls

    private setupControls(): void {
        const lineNumbers = byId('line-numbers-toggle');
        if (lineNumbers) {
            lineNumbers.classList.toggle('is-active', JSONFormatter.getShowLineNumbers());
            this.teardown.push(on(lineNumbers, 'click', () => this.toggleLineNumbers()));
        }

        const dismiss = byId('dismiss-warning');
        if (dismiss) {
            this.teardown.push(on(dismiss, 'click', () => this.hideWarning()));
        }
    }

    private toggleLineNumbers(): void {
        const next = !JSONFormatter.getShowLineNumbers();
        JSONFormatter.setShowLineNumbers(next);

        const toggle = byId('line-numbers-toggle');
        toggle?.classList.toggle('is-active', next);
        toggle?.setAttribute('aria-pressed', String(next));

        const output = byId('output');
        if (output && this.currentJson !== null) {
            output.innerHTML = JSONFormatter.renderJson(this.currentJson);
            output.classList.toggle('hide-line-numbers', !next);
        }
    }

    // ---------------------------------------------------------------- format

    public format(): void {
        const inputEl = byId<HTMLTextAreaElement>('input');
        const output = byId('output');
        if (!inputEl || !output) {
            return;
        }

        const input = inputEl.value.trim();
        if (!input) {
            this.currentJson = null;
            output.innerHTML = '';
            this.setEmpty(true);
            this.hideWarning();
            this.publishStatus({});
            return;
        }

        try {
            const { parsed, wasStructurallyFixed } = JSONParser.parseWithStatus(input);
            this.currentJson = parsed;

            output.classList.remove('is-error');
            output.innerHTML = JSONFormatter.renderJson(parsed);
            output.classList.toggle('hide-line-numbers', !JSONFormatter.getShowLineNumbers());
            this.setEmpty(false);

            if (wasStructurallyFixed) {
                this.showWarning();
            } else {
                this.hideWarning();
            }

            this.publishStatus(this.describe(parsed, input, wasStructurallyFixed));

            if (!this.loadingFromHistory) {
                this.messenger.post({ command: 'addFormatHistory', json: input });
            }
        } catch (error) {
            this.currentJson = null;
            const message =
                error instanceof Error
                    ? JSONParser.getParseErrorMessage(input, error)
                    : 'Unknown parsing error';

            output.classList.add('is-error');
            output.textContent = message;
            this.setEmpty(false);
            this.hideWarning();
            this.publishStatus({
                left: [{ text: 'Invalid JSON', icon: Icons.error, tone: 'error', title: message }]
            });
        }
    }

    /** Facts about the formatted document, for the status bar. */
    private describe(parsed: unknown, source: string, autoCorrected: boolean): StatusModel {
        const lines = JSON.stringify(parsed, null, 2).split('\n').length;
        const bytes = new Blob([source]).size;

        return {
            left: [
                { text: 'Valid JSON', icon: Icons.valid, tone: 'ok' },
                { text: plural(lines, 'line') },
                { text: formatBytes(bytes) }
            ],
            right: autoCorrected
                ? [{ text: 'Auto-corrected', icon: Icons.warning, tone: 'warn' }]
                : []
        };
    }

    private publishStatus(status: StatusModel): void {
        this.status = status;
        this.onStatusChange(status);
    }

    /** The status model for this view, re-published when it becomes active. */
    public getStatus(): StatusModel {
        return this.status;
    }

    private setEmpty(empty: boolean): void {
        const panel = byId('output-panel');
        if (panel) {
            panel.dataset.empty = String(empty);
        }
    }

    /** Loads JSON from history without echoing it back as a new history entry. */
    public load(json: string): void {
        const inputEl = byId<HTMLTextAreaElement>('input');
        if (!inputEl) {
            return;
        }
        this.loadingFromHistory = true;
        try {
            inputEl.value = json;
            this.format();
        } finally {
            this.loadingFromHistory = false;
        }
    }

    public clear(): void {
        const inputEl = byId<HTMLTextAreaElement>('input');
        const output = byId('output');
        if (inputEl) {
            inputEl.value = '';
        }
        if (output) {
            output.innerHTML = '';
        }
        this.currentJson = null;
        this.search.clear();
        this.hideWarning();
        this.setEmpty(true);
        this.publishStatus({});
    }

    public copy(): void {
        if (this.currentJson === null) {
            return;
        }
        void navigator.clipboard
            .writeText(JSON.stringify(this.currentJson, null, 2))
            .catch(error => console.error('Failed to copy to clipboard:', error));
    }

    public save(): void {
        const content = this.serializeForSave();
        if (content) {
            this.messenger.post({ command: 'saveFormattedJson', content });
        }
    }

    private serializeForSave(): string | null {
        if (this.currentJson !== null) {
            return JSON.stringify(this.currentJson, null, 2);
        }
        const text = byId('output')?.textContent?.trim();
        if (!text) {
            return null;
        }
        try {
            return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            return null;
        }
    }

    // --------------------------------------------------------------- warning

    private showWarning(): void {
        const warning = byId('warning-notification');
        if (!warning) {
            return;
        }
        const message = warning.querySelector('.notice__message');
        if (message) {
            message.textContent =
                'The input had errors that were corrected automatically. ' +
                'What you see below is the repaired JSON.';
        }
        warning.hidden = false;
    }

    private hideWarning(): void {
        const warning = byId('warning-notification');
        if (warning) {
            warning.hidden = true;
        }
    }

    // --------------------------------------------------------------- folding

    private setupFolding(): void {
        const output = byId('output');
        if (!output) {
            return;
        }
        // Delegated, so it survives every re-render of the output.
        this.teardown.push(
            delegate(output, 'click', '.fold-arrow', (arrow, event) => {
                event.stopPropagation();
                this.toggleFold(output, arrow);
            })
        );
    }

    private toggleFold(output: HTMLElement, arrow: HTMLElement): void {
        const foldId = arrow.getAttribute('data-fold-id');
        if (!foldId) {
            return;
        }

        const folding = !arrow.classList.contains('folded');
        arrow.classList.toggle('folded', folding);

        const lineNumbers = output.querySelector('.json-container .line-numbers');
        const allLines = qsa('.json-line', output);
        const content = qsa(`.foldable-content[data-fold-id="${foldId}"]`, output);

        for (const element of content) {
            element.classList.toggle('hidden', folding);

            if (lineNumbers) {
                const line = element.closest('.json-line');
                const index = line ? allLines.indexOf(line as HTMLElement) : -1;
                const lineNumber = index >= 0 ? (lineNumbers.children[index] as HTMLElement) : null;
                if (lineNumber) {
                    lineNumber.style.display = folding ? 'none' : '';
                }
            }
        }

        this.updateFoldEllipsis(arrow.closest('.json-line'), folding);
    }

    private updateFoldEllipsis(line: Element | null, folding: boolean): void {
        if (!line) {
            return;
        }
        const existing = line.querySelector('.fold-ellipsis');

        if (!folding) {
            existing?.remove();
            return;
        }
        if (existing) {
            return;
        }

        const bracket = line.querySelector('.bracket, .brace');
        if (bracket) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'fold-ellipsis';
            ellipsis.textContent = ' ...';
            bracket.after(ellipsis);
        }
    }

    // ------------------------------------------------------------------ copy

    /**
     * Copying from the output must yield plain JSON, not the rendered markup --
     * line numbers and fold arrows have to be stripped.
     */
    private setupCopyInterception(): void {
        const output = byId('output');
        if (!output) {
            return;
        }

        this.teardown.push(
            on(output, 'copy', event => {
                if (this.currentJson === null) {
                    return;
                }
                const selection = window.getSelection();
                if (!selection || selection.rangeCount === 0) {
                    return;
                }

                const fragment = selection.getRangeAt(0).cloneContents();
                const text = extractPlainText(fragment);
                if (text && event.clipboardData) {
                    event.preventDefault();
                    event.clipboardData.setData('text/plain', text);
                }
            })
        );
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
        this.splitter?.dispose();
        this.panels?.dispose();
        this.search.dispose();
    }
}

/** Recovers the underlying JSON text from a selection of rendered output. */
export function extractPlainText(fragment: DocumentFragment): string {
    const temp = document.createElement('div');
    temp.appendChild(fragment.cloneNode(true));
    temp.querySelectorAll('summary, .line-number').forEach(element => element.remove());

    const lines = Array.from(temp.querySelectorAll('.json-line'))
        .map(line => extractLineText(line))
        .filter((line): line is string => line !== null);

    return lines.length > 0 ? lines.join('\n') : temp.textContent ?? '';
}

const SKIP_CLASSES = ['line-number', 'fold-arrow', 'fold-ellipsis'];

function extractLineText(element: Element): string | null {
    let result = '';

    const visit = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent ?? '';
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
        }
        const el = node as Element;
        if (SKIP_CLASSES.some(className => el.classList.contains(className))) {
            return;
        }
        Array.from(el.childNodes).forEach(visit);
    };

    visit(element);

    const trimmed = result.trimEnd();
    return trimmed.length > 0 ? trimmed : null;
}
