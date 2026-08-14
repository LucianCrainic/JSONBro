/**
 * The extension's configuration, read once and pushed to the panels.
 *
 * Nothing was configurable before: indent width, line numbers and strict diff
 * were decided in code, and the seven keyboard shortcuts existed only inside
 * the webview where no one could see or change them.
 */
import * as vscode from 'vscode';
import type { Settings } from './shared/messages';

export const DEFAULT_SETTINGS: Settings = {
    showLineNumbers: true,
    indentSize: 2,
    strictDiff: false,
    defaultPaneRatio: 0.5,
    autoFormatOnPaste: false,
    searchScope: 'all',
    maxInlineSize: 2 * 1024 * 1024,
    diffMaxDocumentSize: 25 * 1024 * 1024,
    diffArrayAlignBudget: 1_000_000
};

export function readSettings(): Settings {
    const config = vscode.workspace.getConfiguration('jsonbro');

    return {
        showLineNumbers: config.get('showLineNumbers', DEFAULT_SETTINGS.showLineNumbers),
        indentSize: clamp(config.get('indentSize', DEFAULT_SETTINGS.indentSize), 1, 8),
        strictDiff: config.get('strictDiff', DEFAULT_SETTINGS.strictDiff),
        defaultPaneRatio: clamp(
            config.get('defaultPaneRatio', DEFAULT_SETTINGS.defaultPaneRatio),
            0.2,
            0.8
        ),
        autoFormatOnPaste: config.get('autoFormatOnPaste', DEFAULT_SETTINGS.autoFormatOnPaste),
        searchScope: config.get('search.defaultScope', DEFAULT_SETTINGS.searchScope),
        maxInlineSize: config.get('maxInlineSize', DEFAULT_SETTINGS.maxInlineSize),
        diffMaxDocumentSize: config.get(
            'diff.maxDocumentSize',
            DEFAULT_SETTINGS.diffMaxDocumentSize
        ),
        diffArrayAlignBudget: config.get(
            'diff.arrayAlignBudget',
            DEFAULT_SETTINGS.diffArrayAlignBudget
        )
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
