import {
    formatSize,
    HistoryStore,
    HISTORY_LIMIT,
    MAX_STORED_BYTES,
    relativeTime
} from '../history-store';

/** Stands in for VS Code's globalState, which is all the store touches. */
function stubContext() {
    const data = new Map<string, unknown>();
    return {
        globalState: {
            get: <T>(key: string, fallback: T): T => (data.get(key) as T) ?? fallback,
            update: async (key: string, value: unknown) => {
                data.set(key, value);
            }
        }
    } as never;
}

describe('HistoryStore', () => {
    let store: HistoryStore;

    beforeEach(() => {
        store = new HistoryStore(stubContext());
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
        expect(entry.timestamp).toBeGreaterThan(0);
        expect(entry.truncated).toBe(false);
    });

    /*
     * Everything formatted was sent to the host and kept, so fifty large
     * documents sat in storage forever. Past the cap only a preview is kept,
     * and the entry says so rather than pretending otherwise.
     */
    it('keeps only a preview of a very large document', async () => {
        const big = 'x'.repeat(MAX_STORED_BYTES + 5000);
        await store.addFormat(big);

        const [entry] = store.getFormatHistory();
        expect(entry.json).toHaveLength(MAX_STORED_BYTES);
        expect(entry.truncated).toBe(true);
        expect(entry.size).toBe(big.length);
    });

    it('stops at the limit', async () => {
        for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
            await store.addFormat(`{"i":${i}}`);
        }

        const entries = store.getFormatHistory();
        expect(entries).toHaveLength(HISTORY_LIMIT);
        expect(entries[0].json).toBe(`{"i":${HISTORY_LIMIT + 9}}`);
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
        await store.removeFormat(0);

        expect(store.getFormatHistory().map(entry => entry.json)).toEqual(['a']);
    });

    it('ignores a removal outside the list', async () => {
        await store.addFormat('a');
        await store.removeFormat(9);
        await store.removeFormat(-1);

        expect(store.getFormatHistory()).toHaveLength(1);
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
