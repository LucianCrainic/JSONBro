/**
 * The badge a pane shows when what it is displaying is no longer the truth.
 *
 * Several things in this panel are computed on demand rather than as you type:
 * the formatted output, the picture, the list of changes. That is deliberate --
 * re-running them on every keystroke is unaffordable on a large document -- but
 * it leaves a pane quietly showing a document that is one edit out of date, with
 * nothing to say so. The reader has no way to tell "this is what your JSON looks
 * like" from "this is what your JSON looked like a minute ago".
 *
 * So a stale pane says so in its own header, and the badge is itself the button
 * that fixes it. That is the point of putting it here rather than in the status
 * bar: the explanation and the remedy are the same object, next to the content
 * they are about.
 */
import { byId, on } from './dom';
import { setTip } from './tooltip';

/**
 * Why the badge is up.
 *
 * `stale` -- the pane is showing an older document than the input holds.
 * `unsaved` -- the pane holds edits that exist nowhere else yet.
 */
export type FlagTone = 'stale' | 'unsaved';

const ICONS: Record<FlagTone, string> = {
    stale: 'refresh',
    unsaved: 'circle-filled'
};

export interface PaneFlagOptions {
    /** The pane the badge belongs to; it carries `data-flag` while raised. */
    panelId: string;
    /** The button rendered into that pane's header. */
    buttonId: string;
    /** What pressing the badge does about it. */
    onAct: () => void;
}

export class PaneFlag {
    private readonly options: PaneFlagOptions;
    private readonly teardown: Array<() => void> = [];
    private tone: FlagTone | null = null;

    constructor(options: PaneFlagOptions) {
        this.options = options;

        const button = byId(options.buttonId);
        if (button) {
            this.teardown.push(
                on(button, 'click', () => {
                    // Lowered first: the action may be asynchronous, and a badge
                    // that stays up while its own remedy runs reads as broken.
                    this.lower();
                    options.onAct();
                })
            );
        }
    }

    /** Whether the badge is currently up, and why. */
    public get raised(): FlagTone | null {
        return this.tone;
    }

    /**
     * Says what is wrong and offers the fix.
     *
     * `shortcut` is the keystroke that does the same thing, shown in the
     * tooltip so the badge teaches the keyboard route rather than replacing it.
     */
    public raise(text: string, tone: FlagTone, hint: string, shortcut?: string): void {
        this.tone = tone;
        byId(this.options.panelId)?.setAttribute('data-flag', tone);

        const button = byId(this.options.buttonId);
        if (!button) {
            return;
        }

        const icon = button.querySelector('.pane__flag-icon');
        icon?.setAttribute('class', `codicon codicon-${ICONS[tone]} pane__flag-icon`);

        const label = button.querySelector('.pane__flag-text');
        if (label) {
            label.textContent = text;
        }

        button.hidden = false;
        button.setAttribute('aria-label', `${text}. ${hint}`);
        setTip(button, hint, shortcut);
    }

    public lower(): void {
        if (!this.tone) {
            return;
        }
        this.tone = null;
        byId(this.options.panelId)?.removeAttribute('data-flag');

        const button = byId(this.options.buttonId);
        if (button) {
            button.hidden = true;
        }
    }

    public dispose(): void {
        for (const off of this.teardown) {
            off();
        }
        this.teardown.length = 0;
    }
}
