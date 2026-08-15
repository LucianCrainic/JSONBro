/**
 * Shared pieces of the sidebar's tree items.
 *
 * The sidebar was one provider whose `getChildren` switched on an item kind to
 * decide what a row meant. Splitting it into a view per section removed that
 * switch: each provider returns one shape of item, so there is nothing to
 * dispatch on.
 */
import * as vscode from 'vscode';
import { formatSize, relativeTime, type DiffEntry, type FormatEntry } from '../history-store';

export class JSONBroItem extends vscode.TreeItem {
    constructor(
        label: string,
        tooltip: string | vscode.MarkdownString,
        options: {
            command?: vscode.Command;
            icon?: string;
            description?: string;
            contextValue?: string;
            resourceUri?: vscode.Uri;
            collapsibleState?: vscode.TreeItemCollapsibleState;
        } = {}
    ) {
        super(label, options.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
        this.tooltip = tooltip;
        this.command = options.command;
        this.description = options.description;
        this.contextValue = options.contextValue;
        this.resourceUri = options.resourceUri;
        if (options.icon) {
            this.iconPath = new vscode.ThemeIcon(options.icon);
        }
    }
}

/** Names an unnamed entry after when it was saved. */
export function defaultName(entry: FormatEntry | DiffEntry): string {
    const when = new Date(entry.timestamp);
    const time = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isToday = new Date().toDateString() === when.toDateString();
    return isToday ? time : `${when.toLocaleDateString()} ${time}`;
}

/**
 * The line beneath an entry's name.
 *
 * Relative time and size beat a raw slice of the JSON: one entry looks much
 * like another when they all start with `{"`.
 */
export function describe(entry: FormatEntry | DiffEntry): string {
    const parts = [relativeTime(entry.timestamp), formatSize(entry.size)];
    if (entry.truncated) {
        parts.push('preview only');
    }
    if (entry.pinned) {
        parts.push('pinned');
    }
    return parts.join(' · ');
}

export function previewOf(json: string): string {
    const collapsed = json.replace(/\s+/g, ' ').trim();
    return collapsed.length > 200 ? `${collapsed.slice(0, 200)}…` : collapsed;
}

/**
 * The index of a history entry, carried on the item's resource URI.
 *
 * Commands invoked from a context menu are given the item, not its position,
 * so the position has to travel on something the item already holds.
 */
export function entryUri(kind: 'format' | 'diff', index: number): vscode.Uri {
    return vscode.Uri.parse(`jsonbro://${kind}-history/${index}`);
}
