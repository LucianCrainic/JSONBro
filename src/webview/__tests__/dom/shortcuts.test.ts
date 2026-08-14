import { Shortcuts } from '../../ui/shortcuts';

function press(key: string, options: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...options
    });
    document.dispatchEvent(event);
    return event;
}

describe('Shortcuts', () => {
    let shortcuts: Shortcuts;

    beforeEach(() => {
        shortcuts = new Shortcuts();
    });

    afterEach(() => {
        shortcuts.stop();
    });

    it('runs a modifier binding and prevents the default action', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'm', mod: true, run, description: 'toggle' });
        shortcuts.start();

        const event = press('m', { metaKey: true });

        expect(run).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('accepts either Ctrl or Cmd for a modifier binding', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'k', mod: true, run, description: 'clear' });
        shortcuts.start();

        press('k', { ctrlKey: true });
        press('k', { metaKey: true });

        expect(run).toHaveBeenCalledTimes(2);
    });

    it('ignores the binding when the modifier is absent', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'm', mod: true, run, description: 'toggle' });
        shortcuts.start();

        const event = press('m');

        expect(run).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('is case insensitive about the pressed key', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'm', mod: true, run, description: 'toggle' });
        shortcuts.start();

        press('M', { metaKey: true });

        expect(run).toHaveBeenCalledTimes(1);
    });

    it('distinguishes bindings by shift', () => {
        const plain = jest.fn();
        const shifted = jest.fn();
        shortcuts.register({ key: 'enter', mod: true, run: plain, description: 'run' });
        shortcuts.register({ key: 'enter', mod: true, shift: true, run: shifted, description: 'run back' });
        shortcuts.start();

        press('Enter', { metaKey: true });
        expect(plain).toHaveBeenCalledTimes(1);
        expect(shifted).not.toHaveBeenCalled();

        press('Enter', { metaKey: true, shiftKey: true });
        expect(shifted).toHaveBeenCalledTimes(1);
        expect(plain).toHaveBeenCalledTimes(1);
    });

    /*
     * Cmd+0 means different things in each mode. Previously two separate
     * document listeners both claimed it and relied on mode checks to stay out
     * of each other's way; the registry must dispatch exactly one.
     */
    it('runs only the binding whose guard passes when two share a key', () => {
        const formatRun = jest.fn();
        const diffRun = jest.fn();
        let mode: 'format' | 'diff' = 'format';

        shortcuts.register({
            key: '0',
            mod: true,
            when: () => mode === 'format',
            run: formatRun,
            description: 'even panes'
        });
        shortcuts.register({
            key: '0',
            mod: true,
            when: () => mode === 'diff',
            run: diffRun,
            description: 'reset panes'
        });
        shortcuts.start();

        press('0', { metaKey: true });
        expect(formatRun).toHaveBeenCalledTimes(1);
        expect(diffRun).not.toHaveBeenCalled();

        mode = 'diff';
        press('0', { metaKey: true });
        expect(diffRun).toHaveBeenCalledTimes(1);
        expect(formatRun).toHaveBeenCalledTimes(1);
    });

    it('lets the event through when every guard fails', () => {
        const run = jest.fn();
        shortcuts.register({ key: '0', mod: true, when: () => false, run, description: 'guarded' });
        shortcuts.start();

        const event = press('0', { metaKey: true });

        expect(run).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('stops dispatching after stop()', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'm', mod: true, run, description: 'toggle' });
        shortcuts.start();
        shortcuts.stop();

        press('m', { metaKey: true });

        expect(run).not.toHaveBeenCalled();
    });

    it('does not attach a second listener when start is called twice', () => {
        const run = jest.fn();
        shortcuts.register({ key: 'm', mod: true, run, description: 'toggle' });
        shortcuts.start();
        shortcuts.start();

        press('m', { metaKey: true });

        expect(run).toHaveBeenCalledTimes(1);
    });
});
