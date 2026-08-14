/**
 * The webview's single keyboard-shortcut registry.
 *
 * Everything goes through one document listener. Previously two independent
 * listeners both claimed Cmd+0 and relied on mode checks to avoid colliding,
 * which made the bindings impossible to reason about from either site.
 */

export interface Shortcut {
    /** Lower-case `KeyboardEvent.key`, e.g. 'm', 'enter', '0'. */
    key: string;
    /** Require Ctrl (Windows/Linux) or Cmd (macOS). */
    mod?: boolean;
    shift?: boolean;
    /** Returning false skips the handler and lets the event through. */
    when?: () => boolean;
    run: () => void;
    /** Shown in the shortcut help listing. */
    description: string;
}

export class Shortcuts {
    private bindings: Shortcut[] = [];
    private detach: (() => void) | null = null;

    public register(shortcut: Shortcut): void {
        this.bindings.push(shortcut);
    }

    public start(): void {
        if (this.detach) {
            return;
        }
        const listener = (event: KeyboardEvent) => this.handle(event);
        document.addEventListener('keydown', listener);
        this.detach = () => document.removeEventListener('keydown', listener);
    }

    public stop(): void {
        this.detach?.();
        this.detach = null;
    }

    /** All registered bindings, for building a help listing. */
    public list(): ReadonlyArray<Shortcut> {
        return this.bindings;
    }

    private handle(event: KeyboardEvent): void {
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();

        for (const binding of this.bindings) {
            if (binding.key !== key) {
                continue;
            }
            if (Boolean(binding.mod) !== mod) {
                continue;
            }
            if (Boolean(binding.shift) !== event.shiftKey) {
                continue;
            }
            if (binding.when && !binding.when()) {
                continue;
            }

            event.preventDefault();
            binding.run();
            return;
        }
    }
}
