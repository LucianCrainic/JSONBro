/**
 * Application shell: owns the toolbar, the current mode, keyboard shortcuts
 * and the connection to the extension host, and delegates everything else to
 * the two views.
 */
import { PanelStateStore } from './state';
import { byId, on, qsa } from './ui/dom';
import { Messenger } from './ui/messaging';
import { Shortcuts } from './ui/shortcuts';
import { StatusBar, type StatusModel } from './ui/status-bar';
import { setTip, TooltipHost } from './ui/tooltip';
import { DiffView } from './views/diff-view';
import { FormatView } from './views/format-view';
import { TreeView } from './views/tree-view';
import type { Mode, Settings, SyntaxColors } from '../shared/messages';

/** Every part of a JSON document the theme can colour. */
const SYNTAX_ROLES: Array<keyof SyntaxColors> = [
    'key',
    'string',
    'number',
    'boolean',
    'null',
    'punctuation'
];

const ACTION_LABELS: Record<Mode, { text: string; title: string }> = {
    format: { text: 'Format', title: 'Format JSON' },
    diff: { text: 'Compare', title: 'Compare JSON' },
    tree: { text: 'Build', title: 'Rebuild the tree from the input' }
};

/** The mode each tab selects, in the order they appear. */
const MODE_TABS: Array<[id: string, mode: Mode]> = [
    ['format-mode', 'format'],
    ['tree-mode', 'tree'],
    ['diff-mode', 'diff']
];

/** True while focus is in something the user types into. */
function isTyping(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
}

export class Shell {
    private readonly messenger = new Messenger();
    private readonly shortcuts = new Shortcuts();
    private readonly statusBar = new StatusBar();
    private readonly tooltips = new TooltipHost();
    private readonly formatView: FormatView;
    private readonly diffView: DiffView;
    private readonly treeView: TreeView;
    private readonly state = new PanelStateStore();
    private mode: Mode = 'format';

    constructor() {
        this.formatView = new FormatView(this.messenger);
        this.diffView = new DiffView(this.messenger);
        this.treeView = new TreeView(this.messenger);

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
        this.treeView.onStatusChange = status => {
            if (this.mode === 'tree') {
                this.statusBar.render(status);
            }
        };
        // One document, two renderers: the tree is handed what the format view
        // produced rather than parsing the same input again.
        this.formatView.onDocumentChange = (doc, diagnostics) =>
            this.treeView.setDocument(doc, diagnostics);
    }

    public start(): void {
        this.labelModifierKeys();
        this.tooltips.start();

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
        this.treeView.applySettings(settings);
    }

    /**
     * Paints JSON in the colours the host read out of the active theme.
     *
     * Written as custom properties on the root element rather than as a style
     * tag: the content security policy forbids inline styles, and setting a
     * property through the CSSOM is not an inline style. A role the theme says
     * nothing about is cleared, so the contributed colour for it applies
     * instead of a stale value from the previous theme.
     */
    private applyThemeColors(colors: SyntaxColors): void {
        const root = document.documentElement;
        for (const role of SYNTAX_ROLES) {
            const value = colors[role];
            if (value) {
                root.style.setProperty(`--jb-theme-${role}`, value);
            } else {
                root.style.removeProperty(`--jb-theme-${role}`);
            }
        }
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

        for (const [id, mode] of MODE_TABS) {
            bind(id, () => this.setMode(mode));
        }
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

        for (const [id, tabMode] of MODE_TABS) {
            const tab = byId(id);
            tab?.classList.toggle('active', tabMode === mode);
            tab?.setAttribute('aria-selected', String(tabMode === mode));
        }

        const actionButton = byId('action-btn');
        const actionText = byId('action-text');
        if (actionText) {
            actionText.textContent = ACTION_LABELS[mode].text;
        }
        if (actionButton) {
            setTip(actionButton, ACTION_LABELS[mode].title, 'mod+enter');
        }

        if (mode === 'diff') {
            this.formatView.find.close();
        }

        // The tree shows the same document the format view does, so switching
        // to it formats first when nothing has been formatted yet -- rather
        // than showing an empty pane until the user presses a button they have
        // not seen.
        if (mode === 'tree' && this.treeView.document === null) {
            this.formatView.format();
        }

        this.statusBar.render(this.activeView().getStatus());
    }

    /** Whichever view the toolbar's shared buttons should act on. */
    private activeView(): { getStatus: () => StatusModel } {
        if (this.mode === 'diff') {
            return this.diffView;
        }
        return this.mode === 'tree' ? this.treeView : this.formatView;
    }

    private runAction(): void {
        if (this.mode === 'format') {
            this.formatView.format();
        } else if (this.mode === 'tree') {
            // Same action as Format: one parse feeds both renderers.
            this.formatView.format();
        } else {
            this.diffView.compare();
        }
    }

    private clear(): void {
        if (this.mode === 'diff') {
            this.diffView.clear();
            return;
        }
        // Format and tree share one input and one document, so clearing in
        // either empties both.
        this.formatView.clear();
    }

    private copy(): void {
        if (this.mode === 'format') {
            this.formatView.copy();
        } else if (this.mode === 'tree') {
            this.treeView.copySubtree();
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

        // Walking the change list from the keyboard. These carry no modifier,
        // so they defer to whatever the user is typing into.
        const browsingChanges = () => inDiff() && this.diffView.changeListHasFocus;

        this.shortcuts.register({
            key: 'arrowdown',
            when: browsingChanges,
            description: 'Next change',
            run: () => this.diffView.stepSelection(1)
        });
        this.shortcuts.register({
            key: 'arrowup',
            when: browsingChanges,
            description: 'Previous change',
            run: () => this.diffView.stepSelection(-1)
        });
        this.shortcuts.register({
            key: 'enter',
            when: browsingChanges,
            description: 'Apply the selected change',
            run: () => this.diffView.applySelection()
        });

        // Walking the tree. No modifier, so they defer to the input box.
        const inTree = () => this.mode === 'tree' && !isTyping();

        this.shortcuts.register({
            key: 'arrowdown',
            when: inTree,
            description: 'Next node',
            run: () => this.treeView.step(1)
        });
        this.shortcuts.register({
            key: 'arrowup',
            when: inTree,
            description: 'Previous node',
            run: () => this.treeView.step(-1)
        });
        this.shortcuts.register({
            key: 'arrowright',
            when: inTree,
            description: 'Expand, or move into the node',
            run: () => this.treeView.stepAcross(1)
        });
        this.shortcuts.register({
            key: 'arrowleft',
            when: inTree,
            description: 'Collapse, or move out to the parent',
            run: () => this.treeView.stepAcross(-1)
        });
        this.shortcuts.register({
            key: 'enter',
            when: inTree,
            description: 'Open or close the selected node',
            run: () => this.treeView.toggleSelected()
        });
        this.shortcuts.register({
            key: 'c',
            mod: true,
            shift: true,
            when: () => this.mode === 'tree',
            description: 'Copy the path of the selected node',
            run: () => this.treeView.copyPath()
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
        this.messenger.on('themeColors', message => this.applyThemeColors(message.colors));
        this.messenger.on('openUrl', message => {
            this.setMode('format');
            this.formatView.openUrl(message.url, message.label);
        });
        this.messenger.on('loadDiffSide', message => {
            this.setMode('diff');
            this.diffView.loadSide(message.side, message.json, message.label);
        });
    }
}
