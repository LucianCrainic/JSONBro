/**
 * Saved format and diff sessions, kept across restarts.
 *
 * History used to be a plain array on the tree provider, so every entry a user
 * saved was gone the next time VS Code started -- which made the feature close
 * to pointless. It lives in `globalState` now.
 */
import * as vscode from 'vscode';

const FORMAT_KEY = 'jsonbro.history.format';
const DIFF_KEY = 'jsonbro.history.diff';

/** How many entries of each kind are kept. */
export const HISTORY_LIMIT = 50;

/**
 * The largest document stored whole.
 *
 * Everything formatted used to be sent to the extension host and kept, so
 * fifty large documents sat in memory and in global state forever. Past this
 * only a preview is kept, and the entry says so rather than pretending to hold
 * something it can no longer reproduce.
 */
export const MAX_STORED_BYTES = 256 * 1024;

export interface FormatEntry {
    kind: 'format';
    json: string;
    /** Set when the document was too large to keep whole. */
    truncated?: boolean;
    /** Full length in characters, whether or not it was kept. */
    size: number;
    timestamp: number;
    name?: string;
}

export interface DiffEntry {
    kind: 'diff';
    leftJson: string;
    rightJson: string;
    truncated?: boolean;
    size: number;
    timestamp: number;
    name?: string;
}

export type HistoryEntry = FormatEntry | DiffEntry;

export class HistoryStore {
    private readonly memento: vscode.Memento;

    constructor(context: vscode.ExtensionContext) {
        this.memento = context.globalState;
    }

    public getFormatHistory(): FormatEntry[] {
        return this.memento.get<FormatEntry[]>(FORMAT_KEY, []);
    }

    public getDiffHistory(): DiffEntry[] {
        return this.memento.get<DiffEntry[]>(DIFF_KEY, []);
    }

    public async addFormat(json: string): Promise<void> {
        const stored = clip(json);
        const entry: FormatEntry = {
            kind: 'format',
            json: stored.text,
            truncated: stored.truncated,
            size: json.length,
            timestamp: Date.now()
        };
        await this.write(FORMAT_KEY, [entry, ...this.getFormatHistory()]);
    }

    public async addDiff(leftJson: string, rightJson: string): Promise<void> {
        const left = clip(leftJson);
        const right = clip(rightJson);
        const entry: DiffEntry = {
            kind: 'diff',
            leftJson: left.text,
            rightJson: right.text,
            truncated: left.truncated || right.truncated,
            size: leftJson.length + rightJson.length,
            timestamp: Date.now()
        };
        await this.write(DIFF_KEY, [entry, ...this.getDiffHistory()]);
    }

    public async removeFormat(index: number): Promise<void> {
        await this.write(FORMAT_KEY, without(this.getFormatHistory(), index));
    }

    public async removeDiff(index: number): Promise<void> {
        await this.write(DIFF_KEY, without(this.getDiffHistory(), index));
    }

    public async renameFormat(index: number, name: string): Promise<void> {
        await this.write(FORMAT_KEY, renamed(this.getFormatHistory(), index, name));
    }

    public async renameDiff(index: number, name: string): Promise<void> {
        await this.write(DIFF_KEY, renamed(this.getDiffHistory(), index, name));
    }

    public async clear(): Promise<void> {
        await this.memento.update(FORMAT_KEY, []);
        await this.memento.update(DIFF_KEY, []);
    }

    private async write<T>(key: string, entries: T[]): Promise<void> {
        await this.memento.update(key, entries.slice(0, HISTORY_LIMIT));
    }
}

function clip(text: string): { text: string; truncated: boolean } {
    return text.length > MAX_STORED_BYTES
        ? { text: text.slice(0, MAX_STORED_BYTES), truncated: true }
        : { text, truncated: false };
}

function without<T>(entries: T[], index: number): T[] {
    if (index < 0 || index >= entries.length) {
        return entries;
    }
    return [...entries.slice(0, index), ...entries.slice(index + 1)];
}

function renamed<T extends { name?: string }>(entries: T[], index: number, name: string): T[] {
    if (index < 0 || index >= entries.length) {
        return entries;
    }
    const copy = [...entries];
    copy[index] = { ...copy[index], name: name.trim() || undefined };
    return copy;
}

/** "3 minutes ago", for entry descriptions. */
export function relativeTime(timestamp: number, now = Date.now()): string {
    const seconds = Math.max(0, Math.round((now - timestamp) / 1000));

    // Each entry is the size of the current unit and the name of the next one
    // up, so a value is divided down until it no longer fills the unit above.
    const units: Array<[number, string]> = [
        [60, 'minute'],
        [60, 'hour'],
        [24, 'day'],
        [7, 'week'],
        [4.35, 'month'],
        [12, 'year']
    ];

    let value = seconds;
    let unit = 'second';

    for (const [size, next] of units) {
        if (value < size) {
            break;
        }
        value = Math.floor(value / size);
        unit = next;
    }

    if (unit === 'second' && value < 10) {
        return 'just now';
    }
    return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

/** A compact size, for entry descriptions. */
export function formatSize(chars: number): string {
    if (chars < 1024) {
        return `${chars} B`;
    }
    if (chars < 1024 * 1024) {
        return `${(chars / 1024).toFixed(1)} KB`;
    }
    return `${(chars / (1024 * 1024)).toFixed(1)} MB`;
}
