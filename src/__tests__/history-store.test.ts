import {
    DEFAULT_LIMITS,
    formatSize,
    HistoryStore,
    relativeTime,
    type HistoryLimits
} from '../history-store';

/** Stands in for VS Code's globalState, which is all the store touches. */
function stubContext(data = new Map<string, unknown>()) {
    return {
        data,
        context: {
            globalState: {
                get: <T>(key: string, fallback: T): T => (data.get(key) as T) ?? fallback,
                update: async (key: string, value: unknown) => {
                    data.set(key, value);
                }
            }
        } as never
    };
}

function storeWith(limits: Partial<HistoryLimits> = {}) {
    return new HistoryStore(stubContext().context, () => ({ ...DEFAULT_LIMITS, ...limits }));
}

describe('HistoryStore', () => {
    let store: HistoryStore;

    beforeEach(() => {
        store = storeWith();
    });

    it('starts empty', () => {
        expect(store.getFormatHistory()).toEqual([]);
        expect(store.getDiffHistory()).toEqual([]);
    });

    it('keeps the newest entry first', async () => {
        await store.addFormat('{"a":1}');
        await store.addFormat('{"b":2}');

        expect(store.getFormatHistory().map(entry => entry.json)).toEqual([
            '{"b":2}',
            '{"a":1}'
        ]);
    });

    it('records size and time', async () => {
        await store.addFormat('{"a":1}');
        const [entry] = store.getFormatHistory();

        expect(entry.kind).toBe('format');
        expect(entry.size).toBe(7);
        expect(entry.bytes).toBe(7);
        expect(entry.timestamp).toBeGreaterThan(0);
        expect(entry.truncated).toBe(false);
    });

    it('measures a document in bytes, not code units', async () => {
        // '€' is one code unit but three bytes; the old code compared
        // `text.length` against a limit named in bytes.
        await store.addFormat('€€€');
        const [entry] = store.getFormatHistory();

        expect(entry.size).toBe(9);
        expect(entry.bytes).toBe(9);
    });

    /*
     * Everything formatted was sent to the host and kept, so fifty large
     * documents sat in storage forever. Past the cap only a preview is kept,
     * and the entry says so rather than pretending otherwise.
     */
    it('keeps only a preview of a very large document', async () => {
        const store = storeWith({ maxEntrySize: 1024 });
        const big = 'x'.repeat(6000);
        await store.addFormat(big);

        const [entry] = store.getFormatHistory();
        expect(entry.json).toHaveLength(1024);
        expect(entry.truncated).toBe(true);
        expect(entry.size).toBe(6000);
    });

    it('does not cut a multi-byte character in half', async () => {
        // A limit that lands mid-character would otherwise store a replacement
        // character in place of the half it kept.
        const store = storeWith({ maxEntrySize: 10 });
        await store.addFormat('€'.repeat(20));

        const [entry] = store.getFormatHistory();
        expect(entry.json).toBe('€€€');
        expect(entry.json).not.toContain('\uFFFD');
        expect(entry.bytes).toBeLessThanOrEqual(10);
    });

    it('stops at the entry limit', async () => {
        const store = storeWith({ maxEntries: 5 });
        for (let i = 0; i < 15; i++) {
            await store.addFormat(`{"i":${i}}`);
        }

        const entries = store.getFormatHistory();
        expect(entries).toHaveLength(5);
        expect(entries[0].json).toBe('{"i":14}');
    });

    it('stores both sides of a diff', async () => {
        await store.addDiff('{"a":1}', '{"a":2}');
        const [entry] = store.getDiffHistory();

        expect(entry.kind).toBe('diff');
        expect(entry.leftJson).toBe('{"a":1}');
        expect(entry.rightJson).toBe('{"a":2}');
        expect(entry.size).toBe(14);
    });

    it('removes an entry by position', async () => {
        await store.addFormat('a');
        await store.addFormat('b');
        await store.removeFormats([0]);

        expect(store.getFormatHistory().map(entry => entry.json)).toEqual(['a']);
    });

    /*
     * Removing several used to mean one confirmation and one write each, and
     * each write shifted the positions the remaining indices referred to.
     */
    it('removes several entries in one pass', async () => {
        for (const text of ['a', 'b', 'c', 'd']) {
            await store.addFormat(text);
        }
        // Newest first, so this is 'd' and 'b'.
        await store.removeFormats([0, 2]);

        expect(store.getFormatHistory().map(entry => entry.json)).toEqual(['c', 'a']);
    });

    it('ignores a removal outside the list', async () => {
        await store.addFormat('a');
        await store.removeFormats([9, -1]);

        expect(store.getFormatHistory()).toHaveLength(1);
    });

    it('clears one kind without touching the other', async () => {
        await store.addFormat('a');
        await store.addDiff('a', 'b');
        await store.clearFormats();

        expect(store.getFormatHistory()).toEqual([]);
        expect(store.getDiffHistory()).toHaveLength(1);
    });

    it('renames an entry', async () => {
        await store.addFormat('a');
        await store.renameFormat(0, '  My config  ');

        expect(store.getFormatHistory()[0].name).toBe('My config');
    });

    it('drops the name when renamed to nothing', async () => {
        await store.addFormat('a');
        await store.renameFormat(0, 'x');
        await store.renameFormat(0, '   ');

        expect(store.getFormatHistory()[0].name).toBeUndefined();
    });

    it('clears both lists', async () => {
        await store.addFormat('a');
        await store.addDiff('a', 'b');
        await store.clear();

        expect(store.getFormatHistory()).toEqual([]);
        expect(store.getDiffHistory()).toEqual([]);
    });
});

/*
 * The panel posts a history entry on every format, so formatting one document
 * sixty times used to fill every slot with copies of it and evict everything
 * else the user had actually saved.
 */
describe('de-duplication', () => {
    let store: HistoryStore;

    beforeEach(() => {
        store = storeWith();
    });

    it('keeps one entry however often the same document is saved', async () => {
        for (let i = 0; i < 60; i++) {
            await store.addFormat('{"a":1}');
        }

        expect(store.getFormatHistory()).toHaveLength(1);
    });

    it('moves a repeated document back to the top', async () => {
        await store.addFormat('{"a":1}');
        await store.addFormat('{"b":2}');
        await store.addFormat('{"a":1}');

        expect(store.getFormatHistory().map(entry => entry.json)).toEqual([
            '{"a":1}',
            '{"b":2}'
        ]);
    });

    it('keeps a name the user gave the earlier copy', async () => {
        await store.addFormat('{"a":1}');
        await store.renameFormat(0, 'My config');
        await store.addFormat('{"a":1}');

        expect(store.getFormatHistory()[0].name).toBe('My config');
    });

    it('treats a diff as one document pair', async () => {
        await store.addDiff('{"a":1}', '{"a":2}');
        await store.addDiff('{"a":1}', '{"a":2}');

        expect(store.getDiffHistory()).toHaveLength(1);
    });

    it('does not confuse two pairs that concatenate alike', async () => {
        // Joining the sides with a separator would hash these the same.
        await store.addDiff('a b', 'c');
        await store.addDiff('a', 'b c');

        expect(store.getDiffHistory()).toHaveLength(2);
    });
});

describe('the byte budget', () => {
    /** A document of roughly `bytes` bytes, distinct per call. */
    const doc = (bytes: number, seed: number) => `${seed}`.padEnd(bytes, 'x');

    it('drops the oldest entries once the budget is full', async () => {
        const store = storeWith({ maxTotalSize: 10_000, maxEntrySize: 4000 });
        for (let i = 0; i < 10; i++) {
            await store.addFormat(doc(3000, i));
        }

        const entries = store.getFormatHistory();
        expect(entries).toHaveLength(3);
        expect(entries.map(entry => entry.json[0])).toEqual(['9', '8', '7']);
    });

    it('holds one budget across both kinds rather than one each', async () => {
        const store = storeWith({ maxTotalSize: 10_000, maxEntrySize: 4000 });
        for (let i = 0; i < 3; i++) {
            await store.addFormat(doc(3000, i));
        }
        await store.addDiff(doc(3000, 8), doc(3000, 9));

        const total = [...store.getFormatHistory(), ...store.getDiffHistory()].reduce(
            (sum, entry) => sum + entry.bytes,
            0
        );
        expect(total).toBeLessThanOrEqual(10_000);
        // The diff is newest, so it survives and the oldest formats give way.
        expect(store.getDiffHistory()).toHaveLength(1);
        expect(store.getFormatHistory()).toHaveLength(1);
    });

    it('still keeps what was just saved even if it fills the budget alone', async () => {
        const store = storeWith({ maxTotalSize: 1000, maxEntrySize: 5000 });
        await store.addFormat(doc(4000, 1));

        expect(store.getFormatHistory()).toHaveLength(1);
    });

    it('reports what is being used', async () => {
        const store = storeWith({ maxTotalSize: 10_000 });
        await store.addFormat('{"a":1}');
        await store.addDiff('{"a":1}', '{"a":2}');

        expect(store.usage()).toEqual({ entries: 2, bytes: 7 + 14, limit: 10_000 });
    });
});

describe('entries written by an earlier version', () => {
    /** How the store wrote entries before it recorded bytes or a digest. */
    const legacy = {
        kind: 'format',
        json: '{"a":1}',
        size: 7,
        timestamp: 1,
        truncated: false
    };

    it('fills in the missing fields on read', () => {
        const data = new Map<string, unknown>([['jsonbro.history.format', [legacy]]]);
        const store = new HistoryStore(stubContext(data).context, () => DEFAULT_LIMITS);

        const [entry] = store.getFormatHistory();
        expect(entry.bytes).toBe(7);
        expect(entry.hash).toEqual(expect.any(String));
    });

    it('de-duplicates against a legacy entry', async () => {
        const data = new Map<string, unknown>([['jsonbro.history.format', [legacy]]]);
        const store = new HistoryStore(stubContext(data).context, () => DEFAULT_LIMITS);

        await store.addFormat('{"a":1}');
        expect(store.getFormatHistory()).toHaveLength(1);
    });
});

describe('relativeTime', () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);
    const ago = (seconds: number) => relativeTime(now - seconds * 1000, now);

    it('describes the recent past loosely', () => {
        expect(ago(0)).toBe('just now');
        expect(ago(5)).toBe('just now');
    });

    it('counts up through the units', () => {
        expect(ago(30)).toBe('30 seconds ago');
        expect(ago(60)).toBe('1 minute ago');
        expect(ago(120)).toBe('2 minutes ago');
        expect(ago(3600)).toBe('1 hour ago');
        expect(ago(7200)).toBe('2 hours ago');
        expect(ago(86_400)).toBe('1 day ago');
        expect(ago(86_400 * 3)).toBe('3 days ago');
        expect(ago(86_400 * 14)).toBe('2 weeks ago');
        expect(ago(86_400 * 60)).toBe('1 month ago');
        expect(ago(86_400 * 400)).toBe('1 year ago');
    });

    it('does not go backwards for a future timestamp', () => {
        expect(relativeTime(now + 5000, now)).toBe('just now');
    });
});

describe('formatSize', () => {
    it('scales the unit to the size', () => {
        expect(formatSize(0)).toBe('0 B');
        expect(formatSize(512)).toBe('512 B');
        expect(formatSize(2048)).toBe('2.0 KB');
        expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
    });
});
