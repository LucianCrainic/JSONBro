/**
 * Application shell: owns the toolbar, the current mode, keyboard shortcuts
 * and the connection to the extension host, and delegates everything else to
 * the two views.
 */
import { PanelStateStore } from './state';
import { byId, on, qsa } from './ui/dom';
import { Messenger } from './ui/messaging';
import { Shortcuts } from './ui/shortcuts';
import { StatusBar } from './ui/status-bar';
import { DiffView } from './views/diff-view';
import { FormatView } from './views/format-view';
import type { Mode, Settings } from '../shared/messages';

const ACTION_LABELS: Record<Mode, { text: string; title: string }> = {
    format: { text: 'Format', title: 'Format JSON (Ctrl/Cmd+Enter)' },
    diff: { text: 'Compare', title: 'Compare JSON (Ctrl/Cmd+Enter)' }
};

export class Shell {
    private readonly messenger = new Messenger();
    private readonly shortcuts = new Shortcuts();
    private readonly statusBar = new StatusBar();
    private readonly formatView: FormatView;
    private readonly diffView: DiffView;
    private readonly state = new PanelStateStore();
    private mode: Mode = 'format';

    constructor() {
        this.formatView = new FormatView(this.messenger);
        this.diffView = new DiffView(this.messenger);

        // Only the active view's status is on screen; the other keeps its model
        // so switching back restores it without recomputing.
        this.formatView.onStatusChange = status => {
            if (this.mode === 'format') {
                this.statusBar.render(status);
            }
        };
        this.diffView.onStatusChange = status => {
            if (this.mode === 'diff') {
                this.statusBar.render(status);
            }
        };
    }

    public start(): void {
        this.labelModifierKeys();

        // The host renders <body data-mode="..."> so the first paint is already
        // correct; adopt it rather than assuming a default.
        this.setMode(document.body.dataset.mode === 'diff' ? 'diff' : 'format');

        this.wireToolbar();
        this.wireShortcuts();
        this.wireHostMessages();
        this.wirePersistence();
        this.restore();

        // Only now is every handler in place, so it is safe for the host to
        // send anything it queued while the panel was starting up.
        this.messenger.signalReady();
    }

    // ------------------------------------------------------------ persistence

    /**
     * Puts back whatever the panel held before it was reloaded.
     *
     * VS Code discards a hidden webview's DOM and rebuilds it from the HTML,
     * so without this everything the user had pasted was lost.
     */
    private restore(): void {
        const saved = this.state.read();
        if (!saved) {
            return;
        }

        this.setMode(saved.mode);

        if (saved.showLineNumbers !== undefined) {
            this.formatView.setShowLineNumbers(saved.showLineNumbers);
        }
        if (saved.input) {
            this.formatView.restore(saved.input);
        }
        if (saved.leftJson || saved.rightJson) {
            this.diffView.restore(saved.leftJson ?? '', saved.rightJson ?? '', saved.strict);
        }
    }

    private wirePersistence(): void {
        for (const id of ['input', 'left-json', 'right-json']) {
            const field = byId<HTMLTextAreaElement>(id);
            if (field) {
                on(field, 'input', () => this.saveState());
            }
        }
        // Saved eagerly on hide as well: a webview can be discarded without
        // any unload event once its tab stops being visible.
        window.addEventListener('beforeunload', () => this.state.flush());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.state.flush();
            }
        });
    }

    private saveState(): void {
        this.state.save({
            mode: this.mode,
            input: byId<HTMLTextAreaElement>('input')?.value,
            leftJson: byId<HTMLTextAreaElement>('left-json')?.value,
            rightJson: byId<HTMLTextAreaElement>('right-json')?.value,
            strict: this.diffView.strictMode,
            showLineNumbers: this.formatView.showLineNumbers
        });
    }

    /** Applies the user's configuration to both views. */
    private applySettings(settings: Settings): void {
        this.formatView.applySettings(settings);
        this.diffView.applySettings(settings);
    }

    /** Shows the modifier key this platform actually uses. */
    private labelModifierKeys(): void {
        const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
        for (const key of qsa<HTMLElement>('kbd[data-mod]')) {
            key.textContent = isMac ? '⌘' : 'Ctrl';
        }
    }

    // --------------------------------------------------------------- toolbar

    private wireToolbar(): void {
        const bind = (id: string, handler: () => void) => {
            const element = byId(id);
            if (element) {
                on(element, 'click', handler);
            }
        };

        bind('format-mode', () => this.setMode('format'));
        bind('diff-mode', () => this.setMode('diff'));
        bind('action-btn', () => this.runAction());
        bind('clear', () => this.clear());
        bind('copy', () => this.copy());
        bind('save', () => this.formatView.save());
        bind('search-toggle', () => this.formatView.find.toggle());
    }

    /**
     * Mode is a single attribute on <body>; CSS decides what each mode shows.
     * Nothing here touches element visibility directly.
     */
    private setMode(mode: Mode): void {
        this.mode = mode;
        document.body.dataset.mode = mode;
        this.saveState();

        for (const [id, isActive] of [
            ['format-mode', mode === 'format'],
            ['diff-mode', mode === 'diff']
        ] as const) {
            const tab = byId(id);
            tab?.classList.toggle('active', isActive);
            tab?.setAttribute('aria-selected', String(isActive));
        }

        const actionButton = byId('action-btn');
        const actionText = byId('action-text');
        if (actionText) {
            actionText.textContent = ACTION_LABELS[mode].text;
        }
        actionButton?.setAttribute('title', ACTION_LABELS[mode].title);

        if (mode === 'diff') {
            this.formatView.find.close();
        }

        this.statusBar.render(
            mode === 'format' ? this.formatView.getStatus() : this.diffView.getStatus()
        );
    }

    private runAction(): void {
        if (this.mode === 'format') {
            this.formatView.format();
        } else {
            this.diffView.compare();
        }
    }

    private clear(): void {
        if (this.mode === 'format') {
            this.formatView.clear();
        } else {
            this.diffView.clear();
        }
    }

    private copy(): void {
        if (this.mode === 'format') {
            this.formatView.copy();
        } else {
            this.diffView.copyResults();
        }
    }

    // ------------------------------------------------------------- shortcuts

    private wireShortcuts(): void {
        const inFormat = () => this.mode === 'format';
        const inDiff = () => this.mode === 'diff';

        this.shortcuts.register({
            key: 'm',
            mod: true,
            description: 'Switch between Format and Diff',
            run: () => this.setMode(this.mode === 'format' ? 'diff' : 'format')
        });
        this.shortcuts.register({
            key: 'enter',
            mod: true,
            description: 'Format / Compare',
            run: () => this.runAction()
        });
        this.shortcuts.register({
            key: 'k',
            mod: true,
            description: 'Clear inputs',
            run: () => this.clear()
        });
        this.shortcuts.register({
            key: 'f',
            mod: true,
            when: inFormat,
            description: 'Find in formatted JSON',
            run: () => this.formatView.find.open()
        });
        this.shortcuts.register({
            key: '1',
            mod: true,
            when: inFormat,
            description: 'Favour the input pane (70/30)',
            run: () => {
                this.formatView.setSplitRatio(0.7);
                this.formatView.focusInput();
            }
        });
        this.shortcuts.register({
            key: '2',
            mod: true,
            when: inFormat,
            description: 'Favour the output pane (30/70)',
            run: () => this.formatView.setSplitRatio(0.3)
        });
        this.shortcuts.register({
            key: '0',
            mod: true,
            when: inFormat,
            description: 'Even panes (50/50)',
            run: () => this.formatView.setSplitRatio(0.5)
        });
        this.shortcuts.register({
            key: '0',
            mod: true,
            when: inDiff,
            description: 'Reset pane sizes',
            run: () => this.diffView.resetPanelSizes()
        });

        this.shortcuts.start();
    }

    // ----------------------------------------------------------------- host

    private wireHostMessages(): void {
        this.messenger.on('loadJson', message => {
            this.setMode('format');
            this.formatView.load(message.json);
        });
        this.messenger.on('loadDiff', message => {
            this.setMode('diff');
            this.diffView.load(message.leftJson, message.rightJson);
        });
        this.messenger.on('settings', message => this.applySettings(message.settings));
    }
}
