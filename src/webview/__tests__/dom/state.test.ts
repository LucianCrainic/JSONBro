import { MAX_PERSISTED_INPUT, MAX_PERSISTED_TOTAL } from '../../state';
import { mountPanel } from './helpers/fixture';
import type { Mode, PanelState } from '../../../shared/messages';

function el<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

/** Stands in for the host, holding whatever the panel last saved. */
function installVsCodeApi(initial: PanelState | undefined) {
    let stored: unknown = initial;
    const api = {
        postMessage: jest.fn(),
        getState: () => stored,
        setState: (next: unknown) => {
            stored = next;
        }
    };
    (window as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = () => api;
    return { read: () => stored as PanelState | undefined };
}

/**
 * Boots a panel with a fresh module registry.
 *
 * `acquireVsCodeApi` may only be called once per webview, so the state module
 * caches its result -- which would otherwise leak the first test's stub into
 * every later one.
 */
function boot(mode: Mode): void {
    jest.isolateModules(() => {
        mountPanel(mode);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Shell } = require('../../shell');
        new Shell().start();
    });
}

function typeInto(id: string, value: string): void {
    const field = el<HTMLTextAreaElement>(id);
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('panel state', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.resetModules();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('saving', () => {
        it('records what was typed into the format input', () => {
            const host = installVsCodeApi(undefined);
            boot('format');

            typeInto('input', '{"a":1}');
            jest.runOnlyPendingTimers();

            expect(host.read()?.input).toBe('{"a":1}');
            expect(host.read()?.mode).toBe('format');
        });

        it('records both sides of a diff', () => {
            const host = installVsCodeApi(undefined);
            boot('diff');

            typeInto('left-json', '{"a":1}');
            typeInto('right-json', '{"a":2}');
            jest.runOnlyPendingTimers();

            expect(host.read()?.leftJson).toBe('{"a":1}');
            expect(host.read()?.rightJson).toBe('{"a":2}');
        });

        /* Saving runs on every keystroke, and each save is serialised into the
           host's storage, so a burst of typing must collapse into one write. */
        it('writes once for a burst of typing', () => {
            const host = installVsCodeApi(undefined);
            boot('format');

            const field = el<HTMLTextAreaElement>('input');
            for (const value of ['{', '{"', '{"a', '{"a"']) {
                field.value = value;
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }

            expect(host.read()).toBeUndefined();

            jest.runOnlyPendingTimers();
            expect(host.read()?.input).toBe('{"a"');
        });

        /* The whole state is re-serialised on every write, so a huge document
           would make typing stall. It is cheaper to reformat than to carry. */
        it('does not carry a very large document', () => {
            const host = installVsCodeApi(undefined);
            boot('format');

            typeInto('input', 'x'.repeat(MAX_PERSISTED_INPUT + 1));
            jest.runOnlyPendingTimers();

            expect(host.read()?.input).toBeUndefined();
            expect(host.read()?.mode).toBe('format');
        });

        /* A diff panel holds three documents, so capping each field alone let
           it persist three times the number that cap advertised. */
        it('keeps the three fields inside one combined budget', () => {
            const host = installVsCodeApi(undefined);
            boot('diff');

            const big = 'x'.repeat(MAX_PERSISTED_INPUT);
            typeInto('left-json', big);
            typeInto('right-json', big);
            typeInto('input', big);
            jest.runOnlyPendingTimers();

            const saved = host.read();
            const total = [saved?.input, saved?.leftJson, saved?.rightJson]
                .filter((value): value is string => typeof value === 'string')
                .reduce((sum, value) => sum + value.length, 0);

            expect(total).toBeLessThanOrEqual(MAX_PERSISTED_TOTAL);
        });

        it('records the mode when it changes', () => {
            const host = installVsCodeApi(undefined);
            boot('format');

            el('diff-mode').click();
            jest.runOnlyPendingTimers();

            expect(host.read()?.mode).toBe('diff');
        });
    });

    describe('restoring', () => {
        it('puts the input back and formats it', () => {
            installVsCodeApi({ mode: 'format', input: '{"a":1}' });
            boot('format');

            expect(el<HTMLTextAreaElement>('input').value).toBe('{"a":1}');
            expect(el('output').textContent).toContain('"a"');
        });

        it('puts both diff sides back without comparing', () => {
            installVsCodeApi({ mode: 'diff', leftJson: '{"a":1}', rightJson: '{"a":2}' });
            boot('diff');

            expect(el<HTMLTextAreaElement>('left-json').value).toBe('{"a":1}');
            expect(el<HTMLTextAreaElement>('right-json').value).toBe('{"a":2}');
            expect(document.querySelectorAll('.diff-item')).toHaveLength(0);
        });

        it('puts the mode back', () => {
            installVsCodeApi({ mode: 'diff' });
            boot('format');

            expect(document.body.dataset.mode).toBe('diff');
        });

        it('puts the line-number setting back', () => {
            installVsCodeApi({ mode: 'format', input: '{"a":1}', showLineNumbers: false });
            boot('format');

            expect(el('output').querySelector('.line-number')).toBeNull();
        });

        it('starts clean when nothing was saved', () => {
            installVsCodeApi(undefined);
            boot('format');

            expect(el<HTMLTextAreaElement>('input').value).toBe('');
            expect(el('output-panel').dataset.empty).toBe('true');
        });
    });
});
