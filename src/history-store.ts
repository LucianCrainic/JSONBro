/**
 * Saved format and diff sessions, kept across restarts.
 *
 * History used to be a plain array on the tree provider, so every entry a user
 * saved was gone the next time VS Code started -- which made the feature close
 * to pointless. It lives in `globalState` now.
 *
 * That move made the size of it matter. Nothing bounded the total: fifty
 * format entries and fifty diff entries, each holding up to 256 KB per side,
 * could reach roughly 38 MB of global state, read back in full on every tree
 * refresh. Nothing de-duplicated either, and the panel posts an entry on every
 * format, so formatting one document repeatedly filled every slot with copies
 * of it. Both are fixed here: entries are keyed by content, and the whole store
 * lives inside a byte budget.
 */
import * as crypto from 'crypto';
import * as vscode from 'vscode';

const FORMAT_KEY = 'jsonbro.history.format';
const DIFF_KEY = 'jsonbro.history.diff';
const FILES_KEY = 'jsonbro.history.files';

/** How many recently opened files are remembered. Paths are tiny. */
export const RECENT_FILE_LIMIT = 20;

/**
 * How many entries may be pinned.
 *
 * A pinned entry is exempt from eviction, so without a cap the budget could be
 * filled entirely with entries nothing is allowed to drop.
 */
export const PIN_LIMIT = 10;

/**
 * What the store is allowed to keep. Every value is user-configurable.
 *
 * `maxTotalSize` is the budget across *both* kinds of entry, not each -- a
 * per-kind budget would quietly be twice the number it advertised.
 */
export interface HistoryLimits {
    maxEntries: number;
    /** Largest single document stored whole, in bytes. */
    maxEntrySize: number;
    /** Ceiling on everything the store holds, in bytes. */
    maxTotalSize: number;
}

export const DEFAULT_LIMITS: HistoryLimits = {
    maxEntries: 50,
    maxEntrySize: 128 * 1024,
    maxTotalSize: 5 * 1024 * 1024
};

interface StoredEntry {
    /** Bytes this entry occupies in global state. */
    bytes: number;
    /** Content digest, so re-saving the same document reuses its slot. */
    hash: string;
    /** Full size of the original document in bytes, kept or not. */
    size: number;
    timestamp: number;
    /**
     * Write order across both lists.
     *
     * `timestamp` has millisecond resolution and saving is far quicker than
     * that, so entries written in the same tick would otherwise be ordered
     * arbitrarily -- and eviction, which drops the oldest first, would pick
     * the wrong one.
     */
    seq: number;
    name?: string;
    /** Set when the document was too large to keep whole. */
    truncated?: boolean;
    /** Kept regardless of age once the budget is full. */
    pinned?: boolean;
}

export interface FormatEntry extends StoredEntry {
    kind: 'format';
    json: string;
}

export interface DiffEntry extends StoredEntry {
    kind: 'diff';
    leftJson: string;
    rightJson: string;
}

export type HistoryEntry = FormatEntry | DiffEntry;

/** A file opened through JSONBro, remembered so it can be reopened. */
export interface RecentFile {
    uri: string;
    timestamp: number;
}

/** What the store currently holds, for showing the user where they stand. */
export interface HistoryUsage {
    entries: number;
    bytes: number;
    limit: number;
}

export class HistoryStore {
    private readonly memento: vscode.Memento;
    private readonly readLimits: () => HistoryLimits;

    constructor(context: vscode.ExtensionContext, readLimits: () => HistoryLimits = () => DEFAULT_LIMITS) {
        this.memento = context.globalState;
        this.readLimits = readLimits;
    }

    public getFormatHistory(): FormatEntry[] {
        return this.memento.get<FormatEntry[]>(FORMAT_KEY, []).map(upgradeFormat);
    }

    public getDiffHistory(): DiffEntry[] {
        return this.memento.get<DiffEntry[]>(DIFF_KEY, []).map(upgradeDiff);
    }

    public usage(): HistoryUsage {
        const formats = this.getFormatHistory();
        const diffs = this.getDiffHistory();
        return {
            entries: formats.length + diffs.length,
            bytes: [...formats, ...diffs].reduce((sum, entry) => sum + entry.bytes, 0),
            limit: this.readLimits().maxTotalSize
        };
    }

    public async addFormat(json: string): Promise<void> {
        const limits = this.readLimits();
        const stored = clip(json, limits.maxEntrySize);
        const entry: FormatEntry = {
            kind: 'format',
            json: stored.text,
            truncated: stored.truncated,
            bytes: stored.bytes,
            hash: digest(stored.text),
            size: byteLength(json),
            timestamp: Date.now(),
            seq: this.nextSeq()
        };

        await this.commit(promote(this.getFormatHistory(), entry), this.getDiffHistory());
    }

    public async addDiff(leftJson: string, rightJson: string): Promise<void> {
        const limits = this.readLimits();
        // Each side gets its own allowance, so one huge side cannot crowd out
        // the other and leave the entry unusable.
        const left = clip(leftJson, limits.maxEntrySize);
        const right = clip(rightJson, limits.maxEntrySize);
        const entry: DiffEntry = {
            kind: 'diff',
            leftJson: left.text,
            rightJson: right.text,
            truncated: left.truncated || right.truncated,
            bytes: left.bytes + right.bytes,
            hash: digestPair(left.text, right.text),
            size: byteLength(leftJson) + byteLength(rightJson),
            timestamp: Date.now(),
            seq: this.nextSeq()
        };

        await this.commit(this.getFormatHistory(), promote(this.getDiffHistory(), entry));
    }

    public async removeFormats(indices: number[]): Promise<void> {
        await this.commit(without(this.getFormatHistory(), indices), this.getDiffHistory());
    }

    public async removeDiffs(indices: number[]): Promise<void> {
        await this.commit(this.getFormatHistory(), without(this.getDiffHistory(), indices));
    }

    public async renameFormat(index: number, name: string): Promise<void> {
        await this.commit(renamed(this.getFormatHistory(), index, name), this.getDiffHistory());
    }

    public async renameDiff(index: number, name: string): Promise<void> {
        await this.commit(this.getFormatHistory(), renamed(this.getDiffHistory(), index, name));
    }

    // ------------------------------------------------------------ recent files

    public getRecentFiles(): RecentFile[] {
        return this.memento.get<RecentFile[]>(FILES_KEY, []);
    }

    public async addRecentFile(uri: string): Promise<void> {
        const rest = this.getRecentFiles().filter(file => file.uri !== uri);
        await this.memento.update(
            FILES_KEY,
            [{ uri, timestamp: Date.now() }, ...rest].slice(0, RECENT_FILE_LIMIT)
        );
    }

    public async clearRecentFiles(): Promise<void> {
        await this.memento.update(FILES_KEY, []);
    }

    // -------------------------------------------------------------------- pins

    public async setFormatPinned(index: number, pinned: boolean): Promise<void> {
        await this.commit(this.pin(this.getFormatHistory(), index, pinned), this.getDiffHistory());
    }

    public async setDiffPinned(index: number, pinned: boolean): Promise<void> {
        await this.commit(this.getFormatHistory(), this.pin(this.getDiffHistory(), index, pinned));
    }

    /** Marks an entry pinned, refusing once the cap is reached. */
    private pin<T extends StoredEntry>(entries: T[], index: number, pinned: boolean): T[] {
        if (index < 0 || index >= entries.length) {
            return entries;
        }
        if (pinned && this.pinnedCount() >= PIN_LIMIT && !entries[index].pinned) {
            return entries;
        }

        const copy = [...entries];
        copy[index] = { ...copy[index], pinned: pinned || undefined };
        return copy;
    }

    private pinnedCount(): number {
        return [...this.getFormatHistory(), ...this.getDiffHistory()].filter(
            entry => entry.pinned
        ).length;
    }

    public async clearFormats(): Promise<void> {
        await this.memento.update(FORMAT_KEY, []);
    }

    public async clearDiffs(): Promise<void> {
        await this.memento.update(DIFF_KEY, []);
    }

    public async clear(): Promise<void> {
        await this.clearFormats();
        await this.clearDiffs();
    }

    /** The next write order number, across both lists. */
    private nextSeq(): number {
        const seen = [...this.getFormatHistory(), ...this.getDiffHistory()].map(
            entry => entry.seq
        );
        return Math.max(0, ...seen) + 1;
    }

    /** Writes both lists back, having brought them inside the budget. */
    private async commit(formats: FormatEntry[], diffs: DiffEntry[]): Promise<void> {
        const trimmed = applyBudget(formats, diffs, this.readLimits());
        await this.memento.update(FORMAT_KEY, trimmed.formats);
        await this.memento.update(DIFF_KEY, trimmed.diffs);
    }
}

/**
 * Puts an entry at the top, replacing any earlier copy of the same document.
 *
 * Keeping the older entry's name matters: a user who took the trouble to
 * name something should not lose the name by formatting it again.
 */
function promote<T extends StoredEntry>(entries: T[], entry: T): T[] {
    const previous = entries.find(existing => existing.hash === entry.hash);
    const rest = entries.filter(existing => existing.hash !== entry.hash);
    const carried = previous
        ? { ...entry, name: previous.name ?? entry.name, pinned: previous.pinned }
        : entry;
    return [carried, ...rest];
}

/**
 * Drops whatever does not fit, oldest first.
 *
 * Both lists are considered together against one budget, so a run of large
 * diffs evicts old format entries rather than each kind quietly getting the
 * full allowance to itself.
 */
export function applyBudget(
    formats: FormatEntry[],
    diffs: DiffEntry[],
    limits: HistoryLimits
): { formats: FormatEntry[]; diffs: DiffEntry[] } {
    // A pinned entry is never dropped, by count or by budget: pinning is the
    // user saying this one matters more than recency does.
    const cap = <T extends StoredEntry>(entries: T[]): T[] => {
        let kept = 0;
        return entries.filter(entry => entry.pinned || ++kept <= limits.maxEntries);
    };
    const capped = { formats: cap(formats), diffs: cap(diffs) };

    const ordered = [
        ...capped.formats.map((entry, index) => ({ list: 'formats' as const, index, entry })),
        ...capped.diffs.map((entry, index) => ({ list: 'diffs' as const, index, entry }))
    ].sort((a, b) => b.entry.seq - a.entry.seq || b.entry.timestamp - a.entry.timestamp);

    const keep = new Set<string>();
    let total = 0;

    // Pinned entries claim their space before anything else. Taking them in
    // recency order with everything else would strand an old pinned entry
    // behind a budget the newer ones had already filled -- which is exactly
    // the entry the user asked to protect.
    for (const item of ordered.filter(candidate => candidate.entry.pinned)) {
        total += item.entry.bytes;
        keep.add(`${item.list}:${item.index}`);
    }

    for (const item of ordered) {
        if (item.entry.pinned) {
            continue;
        }
        // The newest entry is always kept, even alone over budget: refusing to
        // remember what the user just did would be the more surprising failure.
        if (keep.size > 0 && total + item.entry.bytes > limits.maxTotalSize) {
            break;
        }
        total += item.entry.bytes;
        keep.add(`${item.list}:${item.index}`);
    }

    return {
        formats: capped.formats.filter((_, index) => keep.has(`formats:${index}`)),
        diffs: capped.diffs.filter((_, index) => keep.has(`diffs:${index}`))
    };
}

/**
 * Cuts a document down to a byte budget.
 *
 * The old version compared `text.length` -- UTF-16 code units -- against a
 * constant named in bytes, so anything non-ASCII was measured short. Cutting
 * the buffer can land mid-character, which decodes to a replacement character;
 * those are trimmed rather than stored.
 */
function clip(
    text: string,
    maxBytes: number
): { text: string; truncated: boolean; bytes: number } {
    const buffer = Buffer.from(text, 'utf8');
    if (buffer.length <= maxBytes) {
        return { text, truncated: false, bytes: buffer.length };
    }

    const kept = buffer.subarray(0, maxBytes).toString('utf8').replace(/�+$/, '');
    return { text: kept, truncated: true, bytes: byteLength(kept) };
}

function byteLength(text: string): number {
    return Buffer.byteLength(text, 'utf8');
}

function digest(text: string): string {
    return crypto.createHash('sha1').update(text, 'utf8').digest('hex');
}

/**
 * Digest of two documents as a pair.
 *
 * Length-prefixed rather than joined by a separator, so that ("a b", "c") and
 * ("a", "b c") cannot hash alike and be de-duplicated into one entry.
 */
function digestPair(left: string, right: string): string {
    return digest(`${left.length}:${left}${right}`);
}

/**
 * Entries written before `bytes` and `hash` existed, as they come back out of
 * global state.
 */
type Legacy<T> = Omit<T, 'bytes' | 'hash' | 'seq'> &
    Partial<Pick<StoredEntry, 'bytes' | 'hash' | 'seq'>>;

/** Fills in fields added after an entry was written. */
function upgradeFormat(entry: Legacy<FormatEntry>): FormatEntry {
    return entry.hash !== undefined && entry.bytes !== undefined
        ? (entry as FormatEntry)
        : { ...entry, seq: entry.seq ?? 0, bytes: byteLength(entry.json), hash: digest(entry.json) };
}

function upgradeDiff(entry: Legacy<DiffEntry>): DiffEntry {
    return entry.hash !== undefined && entry.bytes !== undefined
        ? (entry as DiffEntry)
        : {
              ...entry,
              seq: entry.seq ?? 0,
              bytes: byteLength(entry.leftJson) + byteLength(entry.rightJson),
              hash: digestPair(entry.leftJson, entry.rightJson)
          };
}

function without<T>(entries: T[], indices: number[]): T[] {
    const drop = new Set(indices);
    return entries.filter((_, index) => !drop.has(index));
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
export function formatSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
