/**
 * The list of repairs the parser made to the input.
 *
 * This replaces a banner that said only "the input had errors that were
 * corrected automatically", which told the reader that their document had
 * changed but not how. Each repair is named, placed on a line, and clickable.
 */
import type { Diagnostic } from '../engine/diagnostics';
import { byId, delegate, escapeHtml, on } from './dom';
import { plural } from './status-bar';

export interface ProblemsListOptions {
    /** Called when a row is chosen, to bring that line into view. */
    onReveal?: (diagnostic: Diagnostic) => void;
}

export class ProblemsList {
    private readonly teardown: Array<() => void> = [];
    private readonly options: ProblemsListOptions;

    private diagnostics: Diagnostic[] = [];
    private expanded = false;

    constructor(options: ProblemsListOptions = {}) {
        this.options = options;
        this.wire();
    }

    private wire(): void {
        const toggle = byId('problems-toggle');
        if (toggle) {
            this.teardown.push(on(toggle, 'click', () => this.setExpanded(!this.expanded)));
        }

        const list = byId('problems-list');
        if (list) {
            this.teardown.push(
                delegate(list, 'click', '[data-problem-index]', row => {
                    const index = Number(row.dataset.problemIndex);
                    const diagnostic = this.diagnostics[index];
                    if (diagnostic) {
                        this.options.onReveal?.(diagnostic);
                    }
                })
            );
        }
    }

    /** Shows `diagnostics`, or hides the panel when there are none. */
    public show(diagnostics: readonly Diagnostic[]): void {
        this.diagnostics = [...diagnostics];

        const panel = byId('problems');
        if (!panel) {
            return;
        }

        if (this.diagnostics.length === 0) {
            panel.hidden = true;
            this.setExpanded(false);
            return;
        }

        panel.hidden = false;
        panel.dataset.severity = this.worstSeverity();
        this.renderSummary();
        this.renderRows();
    }

    public clear(): void {
        this.show([]);
    }

    public dispose(): void {
        this.teardown.forEach(fn => fn());
        this.teardown.length = 0;
    }

    private worstSeverity(): Diagnostic['severity'] {
        if (this.diagnostics.some(d => d.severity === 'error')) {
            return 'error';
        }
        if (this.diagnostics.some(d => d.severity === 'warning')) {
            return 'warning';
        }
        return 'info';
    }

    /**
     * Counts repairs by weight rather than lumping them together: rewriting
     * quotes is worth a mention, inventing a closing brace is worth a warning.
     */
    private renderSummary(): void {
        const title = byId('problems-title');
        const icon = document.querySelector('.problems__icon');
        if (!title) {
            return;
        }

        const serious = this.diagnostics.filter(d => d.severity !== 'info').length;
        const total = this.diagnostics.length;

        title.textContent =
            serious > 0
                ? `${plural(serious, 'problem')} repaired${
                      total > serious ? `, ${plural(total - serious, 'other change')}` : ''
                  }`
                : `${plural(total, 'change')} made to match JSON`;

        if (icon) {
            const severity = this.worstSeverity();
            icon.className = `codicon problems__icon codicon-${
                severity === 'info' ? 'info' : severity === 'warning' ? 'warning' : 'error'
            }`;
        }
    }

    private renderRows(): void {
        const list = byId('problems-list');
        if (!list) {
            return;
        }

        list.innerHTML = this.diagnostics
            .map(
                (diagnostic, index) => `<li class="problems__row" data-severity="${diagnostic.severity}">
                    <button type="button" class="problems__link" data-problem-index="${index}" data-tip="Go to line ${diagnostic.line}">
                        <span class="problems__where">Line ${diagnostic.line}:${diagnostic.column}</span>
                        <span class="problems__what">${escapeHtml(diagnostic.message)}</span>
                    </button>
                </li>`
            )
            .join('');
    }

    private setExpanded(expanded: boolean): void {
        this.expanded = expanded;

        const list = byId('problems-list');
        if (list) {
            list.hidden = !expanded;
        }

        const toggle = byId('problems-toggle');
        toggle?.setAttribute('aria-expanded', String(expanded));

        const chevron = document.querySelector('.problems__chevron');
        chevron?.classList.toggle('codicon-chevron-down', expanded);
        chevron?.classList.toggle('codicon-chevron-right', !expanded);
    }
}

