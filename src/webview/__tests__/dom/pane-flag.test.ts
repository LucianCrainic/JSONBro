/**
 * The badge a pane raises when what it shows is no longer the truth.
 *
 * Several things here are computed on request rather than as you type, because
 * running them per keystroke is unaffordable on a large document. That is a
 * reasonable trade only if the pane admits when it has fallen behind, which is
 * what these cover.
 */
import { PaneFlag } from '../../ui/pane-flag';

const panel = () => document.getElementById('panel') as HTMLElement;
const button = () => document.getElementById('flag') as HTMLButtonElement;
const text = () => button().querySelector('.pane__flag-text')?.textContent;

function mount(): void {
    document.body.innerHTML = `
        <section id="panel">
            <button id="flag" class="pane__flag" hidden data-tip="placeholder">
                <span class="codicon codicon-refresh pane__flag-icon"></span>
                <span class="pane__flag-text"></span>
            </button>
        </section>`;
}

describe('PaneFlag', () => {
    let act: jest.Mock;
    let flag: PaneFlag;

    beforeEach(() => {
        mount();
        act = jest.fn();
        flag = new PaneFlag({ panelId: 'panel', buttonId: 'flag', onAct: act });
    });

    afterEach(() => flag.dispose());

    it('says nothing until something is wrong', () => {
        expect(button().hidden).toBe(true);
        expect(panel().hasAttribute('data-flag')).toBe(false);
        expect(flag.raised).toBeNull();
    });

    it('names the problem and marks the pane', () => {
        flag.raise('Out of date', 'stale', 'Format it again.', 'mod+enter');

        expect(button().hidden).toBe(false);
        expect(text()).toBe('Out of date');
        expect(panel().dataset.flag).toBe('stale');
        expect(flag.raised).toBe('stale');
    });

    /* The badge explains itself on hover, including the keyboard route. */
    it('carries the sentence and the shortcut as hover text', () => {
        flag.raise('Out of date', 'stale', 'Format it again.', 'mod+enter');

        expect(button().dataset.tip).toBe('Format it again.');
        expect(button().dataset.tipKey).toBe('mod+enter');
    });

    it('drops a shortcut that does not apply to this case', () => {
        flag.raise('Out of date', 'stale', 'Format it again.', 'mod+enter');
        flag.raise('Unsaved', 'unsaved', 'Save it to a file.');

        expect(button().dataset.tipKey).toBeUndefined();
    });

    it('shows a different glyph for a different kind of problem', () => {
        flag.raise('Out of date', 'stale', 'Format it again.');
        expect(button().querySelector('.pane__flag-icon')?.className).toContain('codicon-refresh');

        flag.raise('Unsaved', 'unsaved', 'Save it to a file.');
        expect(button().querySelector('.pane__flag-icon')?.className).toContain(
            'codicon-circle-filled'
        );
    });

    /*
     * The point of a button rather than a label: noticing the problem and
     * fixing it is one movement.
     */
    it('is the control that puts it right', () => {
        flag.raise('Out of date', 'stale', 'Format it again.');
        button().click();

        expect(act).toHaveBeenCalledTimes(1);
    });

    /* A badge left up while its own remedy runs reads as broken. */
    it('comes down before the remedy runs', () => {
        let raisedDuringAct: string | null = 'never ran';
        flag = new PaneFlag({
            panelId: 'panel',
            buttonId: 'flag',
            onAct: () => {
                raisedDuringAct = flag.raised;
            }
        });

        flag.raise('Out of date', 'stale', 'Format it again.');
        button().click();

        expect(raisedDuringAct).toBeNull();
    });

    it('leaves no trace once lowered', () => {
        flag.raise('Out of date', 'stale', 'Format it again.');
        flag.lower();

        expect(button().hidden).toBe(true);
        expect(panel().hasAttribute('data-flag')).toBe(false);
        expect(flag.raised).toBeNull();
    });

    it('survives a pane that is not on this page', () => {
        const orphan = new PaneFlag({ panelId: 'nope', buttonId: 'nope', onAct: act });
        expect(() => {
            orphan.raise('Out of date', 'stale', 'Format it again.');
            orphan.lower();
        }).not.toThrow();
        orphan.dispose();
    });
});
