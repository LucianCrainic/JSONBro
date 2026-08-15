/*
 * The panel's side of the document worker.
 *
 * Two regressions are guarded here, both of which broke opening a file while
 * leaving pasting to work, because formatting falls back to this thread and
 * only reading has nowhere else to run.
 *
 * The first: the worker was started straight from its webview resource URL,
 * which the browser refuses because that URL is not same-origin with the panel
 * document -- no content security policy can permit it. It is fetched and
 * started from a blob: URL instead.
 *
 * The second: the worker then fetched the file itself, which times out. Webview
 * resources are served by a service worker, and a blob: worker sits outside its
 * scope, so nothing answers. The document does the reading and hands the bytes
 * over a chunk at a time.
 */
import { DocumentWorkerClient } from '../worker/client';

/** Stands in for the real thing, recording what it was constructed with. */
class FakeWorker {
    public static constructedWith: string[] = [];
    public readonly posted: Record<string, unknown>[] = [];
    public readonly transferred: unknown[][] = [];
    private readonly listeners = new Map<string, ((event: unknown) => void)[]>();
    public terminated = false;

    constructor(url: string) {
        FakeWorker.constructedWith.push(url);
    }

    public addEventListener(type: string, handler: (event: unknown) => void): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler]);
    }

    public postMessage(message: Record<string, unknown>, transfer: unknown[] = []): void {
        this.posted.push(message);
        this.transferred.push(transfer);
    }

    public terminate(): void {
        this.terminated = true;
    }

    /** Delivers a message as the real worker would. */
    public reply(data: unknown): void {
        for (const handler of this.listeners.get('message') ?? []) {
            handler({ data });
        }
    }

    public get commands(): string[] {
        return this.posted.map(message => message.command as string);
    }
}

/** The URL the host publishes: a different origin from the panel document. */
const SCRIPT_URL = 'https://file+.vscode-resource.vscode-cdn.net/ext/out/webview/worker.js';
const FILE_URL = 'https://file+.vscode-resource.vscode-cdn.net/tmp/big.json';
const BLOB_URL = 'blob:vscode-webview://panel/abc-123';

/** Drains the queue so the fetch, the read and the construction have all run. */
const settled = () => new Promise(resolve => setImmediate(resolve));

let workers: FakeWorker[] = [];
let fetchCalls: string[] = [];
/** Set per test to control what the file read returns. */
let fileResponse: Record<string, unknown>;

const bytesOf = (text: string) => new TextEncoder().encode(text);

beforeEach(() => {
    workers = [];
    fetchCalls = [];
    FakeWorker.constructedWith = [];
    fileResponse = {
        ok: true,
        status: 200,
        body: null,
        arrayBuffer: async () => bytesOf('{"a":1}').buffer
    };

    (globalThis as Record<string, unknown>).Worker = function (url: string) {
        const worker = new FakeWorker(url);
        workers.push(worker);
        return worker;
    };

    (globalThis as Record<string, unknown>).fetch = jest.fn(async (url: string) => {
        fetchCalls.push(url);
        if (url === SCRIPT_URL) {
            return { ok: true, status: 200, text: async () => 'self.onmessage=()=>{};' };
        }
        return fileResponse;
    });

    URL.createObjectURL = jest.fn(() => BLOB_URL);
    URL.revokeObjectURL = jest.fn();
});

describe('starting the document worker', () => {
    it('fetches the bundle and starts it from a blob URL, not the resource URL', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);
        const pending = client.formatUrl(FILE_URL, { indent: 2 });
        await settled();

        expect(FakeWorker.constructedWith).toEqual([BLOB_URL]);
        // The cross-origin URL must never reach the constructor.
        expect(FakeWorker.constructedWith).not.toContain(SCRIPT_URL);

        workers[0].reply({ command: 'failed', id: 1, message: 'stop here' });
        await expect(pending).rejects.toThrow('stop here');
        client.dispose();
    });

    it('starts one worker however many requests arrive while it is starting', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);
        const first = client.formatUrl(FILE_URL, { indent: 2 });
        const second = client.formatUrl(FILE_URL, { indent: 2 });
        await settled();

        expect(workers).toHaveLength(1);
        expect(fetchCalls.filter(url => url === SCRIPT_URL)).toHaveLength(1);

        workers[0].reply({ command: 'failed', id: 1, message: 'a' });
        workers[0].reply({ command: 'failed', id: 2, message: 'b' });
        await expect(first).rejects.toThrow('a');
        await expect(second).rejects.toThrow('b');
        client.dispose();
    });

    it('lets go of the blob when it is disposed', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);
        const pending = client.formatUrl(FILE_URL, { indent: 2 });
        await settled();

        workers[0].reply({ command: 'failed', id: 1, message: 'never mind' });
        await expect(pending).rejects.toThrow('never mind');
        client.dispose();

        expect(workers[0].terminated).toBe(true);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith(BLOB_URL);
    });
});

describe('reading a file', () => {
    it('reads it here rather than leaving the worker to fetch it', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);
        const pending = client.formatUrl(FILE_URL, { indent: 2 });
        await settled();

        // The document fetched the file; the worker was never given its URL.
        expect(fetchCalls).toContain(FILE_URL);
        expect(JSON.stringify(workers[0].posted)).not.toContain(FILE_URL);

        workers[0].reply({ command: 'failed', id: 1, message: 'enough' });
        await expect(pending).rejects.toThrow('enough');
        client.dispose();
    });

    it('opens the read, hands the bytes over, then closes it', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);
        const pending = client.formatUrl(FILE_URL, { indent: 4 });
        await settled();

        expect(workers[0].commands).toEqual(['readStart', 'readChunk', 'readEnd']);
        expect(workers[0].posted[0]).toEqual({ id: 1, command: 'readStart', indent: 4 });
        // The bytes move rather than copy.
        expect(workers[0].transferred[1]).toHaveLength(1);

        workers[0].reply({ command: 'failed', id: 1, message: 'enough' });
        await expect(pending).rejects.toThrow('enough');
        client.dispose();
    });

    it('passes a streamed body across one chunk at a time', async () => {
        const chunks = [bytesOf('{"a":'), bytesOf('1}')];
        let next = 0;
        fileResponse = {
            ok: true,
            status: 200,
            body: {
                getReader: () => ({
                    read: async () =>
                        next < chunks.length
                            ? { done: false, value: chunks[next++] }
                            : { done: true, value: undefined }
                })
            }
        };

        const client = new DocumentWorkerClient(SCRIPT_URL);
        const pending = client.formatUrl(FILE_URL, { indent: 2 });
        await settled();

        expect(workers[0].commands).toEqual(['readStart', 'readChunk', 'readChunk', 'readEnd']);

        workers[0].reply({ command: 'failed', id: 1, message: 'enough' });
        await expect(pending).rejects.toThrow('enough');
        client.dispose();
    });

    it('reports a file the host would not serve', async () => {
        fileResponse = { ok: false, status: 404, body: null };

        const client = new DocumentWorkerClient(SCRIPT_URL);

        await expect(client.formatUrl(FILE_URL, { indent: 2 })).rejects.toThrow(
            'Could not read the file (404)'
        );
        client.dispose();
    });
});

describe('when the worker cannot be started at all', () => {
    beforeEach(() => {
        (globalThis as Record<string, unknown>).fetch = jest.fn(async () => {
            throw new Error('offline');
        });
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('formats text on this thread rather than refusing', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);

        const outcome = await client.formatText('{"a":1}', { indent: 2 });

        expect(outcome.doc.text.toString()).toContain('"a": 1');
        expect(outcome.sourceLength).toBe(7);
        client.dispose();
    });

    it('reports that reading a file needs one, since that cannot run here', async () => {
        const client = new DocumentWorkerClient(SCRIPT_URL);

        await expect(client.formatUrl(FILE_URL, { indent: 2 })).rejects.toThrow(
            'Reading a file needs a worker, which could not be started.'
        );
        client.dispose();
    });
});
