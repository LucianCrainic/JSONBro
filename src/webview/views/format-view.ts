/**
 * The Format view: input textarea, formatted output, folding and search.
 */
import type { Diagnostic } from '../engine/diagnostics';
import {
    InvalidPatternError,
    searchDocument,
    type SearchMatch,
    type SearchOptions
} from '../engine/document-search';
import { FoldState } from '../engine/line-index';
import { PrettySink, type PrettyDocument } from '../engine/pretty-sink';
import { parseInto } from '../engine/recovering-parser';
import { JSONFormatter } from '../formatter';
import { byId, delegate, on } from '../ui/dom';
import { FindWidget } from '../ui/find-widget';
import { Icons } from '../ui/icons';
import { PanelGroup } from '../ui/panels';
import { ProblemsList } from '../ui/problems-list';
import { Splitter } from '../ui/splitter';
import { VirtualList } from '../ui/virtual-list';
import { DocumentWorkerClient, formatHere } from '../worker/client';
import { formatBytes, plural, type StatusModel } from '../ui/status-bar';
import type { Messenger } from '../ui/messaging';
import type { Settings } from '../../shared/messages';

export class FormatView {
    private readonly messenger: Messenger;
    private readonly teardown: Array<() => void> = [];

    /** The formatted document: text plus where its lines are. */
    private doc: PrettyDocument | null = null;
    private folds: FoldState | null = null;
    private list: VirtualList | null = null;

    private diagnostics: Diagnostic[] = [];
    private matches: SearchMatch[] = [];
    private matchIndex = -1;
    private matchesTruncated = false;
    /** Matches grouped by line, so rendering a row is a lookup, not a scan. */
    private matchesByLine = new Map<number, SearchMatch[]>();

    private loadingFromHistory = false;
    private indentSize = 2;
    private maxInlineSize = 2 * 1024 * 1024;
    private readonly worker: DocumentWorkerClient;
    /** Rejects the result of a format that a newer one has overtaken. */
    private formatToken = 0;
    private status: StatusModel = {};

    private splitter: Splitter | null = null;
    private panels: PanelGroup | null = null;
    private readonly problems: ProblemsList;
    public readonly find: FindWidget;

    /** Notifies the shell that the status model changed. */
    public onStatusChange: (status: StatusModel) => void = () => undefined;

    constructor(messenger: Messenger) {
        this.messenger = messenger;
        this.worker = new DocumentWorkerClient(document.body.dataset.workerSrc ?? null);

        this.problems = new ProblemsList({
            onReveal: diagnostic => this.revealSourceLine(diagnostic.line)
        });

        this.find = new FindWidget({
            // Opening find used to be a silent no-op until something had been
            // formatted. Format first instead, so the control always responds.
            ensureSearchable: () => {
                if (this.doc === null) {
                    this.format();
                }
                return this.doc !== null;
            },
            search: (term, options) => this.runSearch(term, options),
            next: () => this.stepMatch(1),
            previous: () => this.stepMatch(-1),
            clear: () => this.clearMatches(),
            position: () => ({
                current: this.matches.length > 0 ? this.matchIndex + 1 : 0,
                total: this.matches.length,
                truncated: this.matchesTruncated
            })
        });

        this.setupLayout();
        this.setupControls();
        this.setupCopyInterception();
        this.setupFolding();
    }

    // ---------------------------------------------------------------- search

    private runSearch(term: string, options: SearchOptions): number {
        if (!this.doc) {
            this.clearMatches();
            return 0;
        }

        // Propagates InvalidPatternError to the widget, which reports it.
        const result = searchDocument(this.doc, term, options);

        this.matches = result.matches;
        this.matchesTruncated = result.truncated;
        this.matchIndex = result.matches.length > 0 ? 0 : -1;
        this.indexMatches();
        this.list?.refresh();

        if (this.matchIndex === 0) {
            this.revealMatch();
        }
        return this.matches.length;
    }

    private indexMatches(): void {
        this.matchesByLine = new Map();
        for (const match of this.matches) {
            const bucket = this.matchesByLine.get(match.line);
            if (bucket) {
                bucket.push(match);
            } else {
                this.matchesByLine.set(match.line, [match]);
            }
        }
    }

    private matchesOnLine(
        line: number
    ): Array<{ start: number; end: number; current?: boolean }> | undefined {
        const found = this.matchesByLine.get(line);
        if (!found) {
            return undefined;
        }
        const current = this.matches[this.matchIndex];
        return found.map(match => ({
            start: match.start,
            end: match.end,
            current: match === current
        }));
    }

    private stepMatch(direction: 1 | -1): void {
        if (this.matches.length === 0) {
            return;
        }
        this.matchIndex =
            (this.matchIndex + direction + this.matches.length) % this.matches.length;
        this.revealMatch();
        this.list?.refresh();
    }

    /** Brings the current match into view, opening any fold hiding it. */
    private revealMatch(): void {
        const match = this.matches[this.matchIndex];
        if (!match || !this.folds) {
            return;
        }

        let hiding = this.folds.foldHiding(match.line);
        while (hiding !== -1) {
            this.folds.toggle(hiding);
            hiding = this.folds.foldHiding(match.line);
        }

        const row = this.folds.rowAt(match.line);
        if (row >= 0) {
            this.list?.revealRow(row);
        }
    }

    private clearMatches(): void {
        this.matches = [];
        this.matchesByLine = new Map();
        this.matchIndex = -1;
        this.matchesTruncated = false;
        this.list?.refresh();
    }

    // ---------------------------------------------------------------- layout

    private setupLayout(): void {
        const container = byId('format-container');
        const handle = byId('splitter');
        const before = byId('input-panel');
        const after = byId('output-panel');

        if (container && handle && before && after) {
            this.splitter = new Splitter({ handle, before, after });
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

    }

    private toggleLineNumbers(): void {
        const next = !JSONFormatter.getShowLineNumbers();
        JSONFormatter.setShowLineNumbers(next);

        const toggle = byId('line-numbers-toggle');
        toggle?.classList.toggle('is-active', next);
        toggle?.setAttribute('aria-pressed', String(next));

        byId('output')?.classList.toggle('hide-line-numbers', !next);
        this.list?.refresh();
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
            this.reset();
            this.publishStatus({});
            return;
        }

        // Parsing no longer throws: broken input is repaired as far as it can
        // be and the repairs are reported, so there is always something to
        // show. That is the point -- the tool should fix JSON, not just judge it.
        //
        // Formatting goes straight from the parse to text, never building a
        // value for the document -- which is what lets a very large file be
        // formatted at all.
        const token = ++this.formatToken;

        if (input.length <= this.maxInlineSize || !this.worker.available) {
            // Small documents finish in a few milliseconds; going through the
            // worker would cost more in round trip than it saves.
            this.present(formatHere(input, this.indentSize), input.length, token);
            if (!this.loadingFromHistory) {
                this.messenger.post({ command: 'addFormatHistory', json: input });
            }
            return;
        }

        this.setBusy('Formatting…');
        this.worker
            .formatText(input, {
                indent: this.indentSize,
                onProgress: (stage, bytes) => this.reportProgress(stage, bytes, token)
            })
            .then(outcome => {
                this.present(outcome, input.length, token);
                if (!this.loadingFromHistory) {
                    this.messenger.post({ command: 'addFormatHistory', json: input });
                }
            })
            .catch(error => this.reportFailure(error, token));
    }

    /**
     * Formats a file the host has made readable, without its text ever passing
     * through the input box.
     */
    public openUrl(url: string, label: string): void {
        const token = ++this.formatToken;
        this.setBusy(`Reading ${label}…`);

        const inputEl = byId<HTMLTextAreaElement>('input');
        if (inputEl) {
            inputEl.value = '';
            inputEl.placeholder = `Showing ${label}`;
        }

        this.worker
            .formatUrl(url, {
                indent: this.indentSize,
                onProgress: (stage, bytes) => this.reportProgress(stage, bytes, token)
            })
            .then(outcome => this.present(outcome, outcome.sourceLength, token))
            .catch(error => this.reportFailure(error, token));
    }

    /** Shows a finished format, unless a newer one has started since. */
    private present(
        outcome: { doc: PrettyDocument; diagnostics: Diagnostic[] },
        sourceLength: number,
        token: number
    ): void {
        if (token !== this.formatToken) {
            return;
        }

        const output = byId('output');
        if (!output) {
            return;
        }

        this.doc = outcome.doc;
        this.folds = new FoldState(outcome.doc.lines);
        this.diagnostics = outcome.diagnostics;

        output.classList.remove('is-error');
        output.classList.toggle('hide-line-numbers', !JSONFormatter.getShowLineNumbers());
        this.setEmpty(false);
        this.ensureList().refresh();

        this.problems.show(outcome.diagnostics);
        this.publishStatus(this.describeDocument(sourceLength, outcome.diagnostics));
        this.find.refresh();
    }

    private reportProgress(stage: string, bytes: number, token: number): void {
        if (token !== this.formatToken) {
            return;
        }
        this.setBusy(`${stage === 'reading' ? 'Reading' : 'Formatting'} ${formatBytes(bytes)}…`);
    }

    private reportFailure(error: unknown, token: number): void {
        if (token !== this.formatToken) {
            return;
        }
        const message = error instanceof Error ? error.message : 'Could not format the document';
        this.publishStatus({
            left: [{ text: message, icon: Icons.error, tone: 'error' }]
        });
    }

    private setBusy(text: string): void {
        this.publishStatus({ left: [{ text, icon: Icons.sync }] });
    }

    // ------------------------------------------------------------- rendering

    private ensureList(): VirtualList {
        const output = byId('output');
        if (this.list || !output) {
            return this.list as VirtualList;
        }

        this.list = new VirtualList({
            viewport: output,
            count: () => this.folds?.visibleCount ?? 0,
            renderRows: (from, to) => this.renderRows(from, to)
        });
        return this.list;
    }

    /** Markup for the rows currently on screen. */
    private renderRows(from: number, to: number): string {
        const doc = this.doc;
        const folds = this.folds;
        if (!doc || !folds) {
            return '';
        }

        const showLineNumbers = JSONFormatter.getShowLineNumbers();
        const total = doc.text.length;
        const out: string[] = [];

        for (let row = from; row < to; row++) {
            const line = folds.lineAt(row);
            if (line >= doc.lines.lineCount) {
                break;
            }

            const text = doc.text.slice(doc.lines.start(line), doc.lines.end(line, total));

            out.push(
                JSONFormatter.renderLine(text, {
                    lineNumber: line + 1,
                    foldable: doc.lines.isFoldable(line),
                    collapsed: folds.isCollapsed(line),
                    showLineNumbers,
                    matches: this.matchesOnLine(line)
                })
            );
        }

        return out.join('');
    }

    private reset(): void {
        this.doc = null;
        this.folds = null;
        this.diagnostics = [];
        this.matches = [];
        this.matchIndex = -1;
        this.list?.refresh();
        this.setEmpty(true);
        this.problems.clear();
    }

    /** Facts about the formatted document, for the status bar. */
    private describeDocument(sourceLength: number, diagnostics: Diagnostic[]): StatusModel {
        // The line count comes from the index for free. It used to be found by
        // re-serialising the whole document and splitting on newlines, on
        // every format.
        const lines = this.doc?.lines.lineCount ?? 0;
        const bytes = sourceLength;
        const repairs = diagnostics.filter(diagnostic => diagnostic.severity !== 'info').length;

        return {
            left: [
                repairs > 0
                    ? { text: 'Repaired', icon: Icons.warning, tone: 'warn' }
                    : { text: 'Valid JSON', icon: Icons.valid, tone: 'ok' },
                { text: plural(lines, 'line') },
                { text: formatBytes(bytes) }
            ],
            right:
                diagnostics.length > 0
                    ? [
                          {
                              text: plural(diagnostics.length, 'fix'),
                              icon: Icons.warning,
                              tone: repairs > 0 ? 'warn' : undefined,
                              title: diagnostics
                                  .slice(0, 5)
                                  .map(d => `Line ${d.line}: ${d.message}`)
                                  .join('\n')
                          }
                      ]
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

    public get showLineNumbers(): boolean {
        return JSONFormatter.getShowLineNumbers();
    }

    public setShowLineNumbers(show: boolean): void {
        if (show === JSONFormatter.getShowLineNumbers()) {
            return;
        }
        this.toggleLineNumbers();
    }

    /** Applies the user's configuration. */
    public applySettings(settings: Settings): void {
        this.setShowLineNumbers(settings.showLineNumbers);
        this.indentSize = settings.indentSize;
        this.setSplitRatio(settings.defaultPaneRatio);
        this.find.setDefaultScope(settings.searchScope);
        this.maxInlineSize = settings.maxInlineSize;

        if (this.doc) {
            this.format();
        }
    }

    /**
     * Puts back input carried through a reload, without recording it as a new
     * history entry -- it was already recorded when it was first formatted.
     */
    public restore(json: string): void {
        this.load(json);
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
        if (inputEl) {
            inputEl.value = '';
        }
        this.find.reset();
        this.reset();
        this.publishStatus({});
    }

    public copy(): void {
        const text = this.serializeForSave();
        if (text === null) {
            return;
        }
        void navigator.clipboard
            .writeText(text)
            .catch(error => console.error('Failed to copy to clipboard:', error));
    }

    public save(): void {
        const content = this.serializeForSave();
        if (content) {
            this.messenger.post({ command: 'saveFormattedJson', content });
        }
    }

    /**
     * The formatted document as text.
     *
     * Streamed out of the store rather than re-serialised from a value, since
     * for a large document there is no value to serialise.
     */
    private serializeForSave(): string | null {
        if (!this.doc) {
            return null;
        }
        return this.doc.text.toString();
    }

    // -------------------------------------------------------------- problems

    /**
     * Brings a source line into view.
     *
     * The repair positions refer to the *input*, which is the text the reader
     * would edit, so this scrolls the input rather than the output.
     */
    private revealSourceLine(line: number): void {
        const input = byId<HTMLTextAreaElement>('input');
        if (!input) {
            return;
        }

        const offset = nthLineOffset(input.value, line);
        input.focus();
        input.setSelectionRange(offset, offset);

        // No scrollIntoView on a textarea position, so approximate by height.
        const totalLines = input.value.split('\n').length || 1;
        input.scrollTop = Math.max(
            0,
            (input.scrollHeight * (line - 1)) / totalLines - input.clientHeight / 2
        );
    }

    // --------------------------------------------------------------- folding

    private setupFolding(): void {
        const output = byId('output');
        if (!output) {
            return;
        }
        // Delegated, so it survives every re-render of the viewport.
        this.teardown.push(
            delegate(output, 'click', '.fold-arrow', (arrow, event) => {
                event.stopPropagation();
                const line = Number(arrow.dataset.foldLine);
                if (Number.isInteger(line)) {
                    this.toggleFold(line);
                }
            })
        );
    }

    /**
     * Opens or closes the container starting on `line`.
     *
     * Folding is a change to the index, not to the output: the rows that
     * disappear were never rendered in the first place unless they happened to
     * be on screen. This used to hide every affected element one at a time and
     * hunt down each of their gutter entries.
     */
    private toggleFold(line: number): void {
        this.folds?.toggle(line);
        this.list?.refresh();
    }

    public collapseAll(): void {
        this.folds?.collapseAll();
        this.list?.refresh();
    }

    public expandAll(): void {
        this.folds?.expandAll();
        this.list?.refresh();
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
                if (this.doc === null) {
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
        this.find.dispose();
        this.problems.dispose();
        this.list?.dispose();
        this.worker.dispose();
    }
}

/** The character offset at which 1-based `line` starts in `text`. */
function nthLineOffset(text: string, line: number): number {
    let offset = 0;
    for (let i = 1; i < line; i++) {
        const next = text.indexOf('\n', offset);
        if (next === -1) {
            return offset;
        }
        offset = next + 1;
    }
    return offset;
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
