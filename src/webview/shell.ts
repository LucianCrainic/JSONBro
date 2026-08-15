/**
 * Application shell: owns the toolbar, the current mode, keyboard shortcuts
 * and the connection to the extension host, and delegates everything else to
 * the two views.
 */
import { PanelStateStore } from './state';
import { byId, on, qsa } from './ui/dom';
import { MenuHost } from './ui/menu';
import { Messenger } from './ui/messaging';
import { Shortcuts } from './ui/shortcuts';
import { FindWidget, type Searchable } from './ui/find-widget';
import { StatusBar, type StatusModel } from './ui/status-bar';
import { setTip, TooltipHost } from './ui/tooltip';
import { DiffView } from './views/diff-view';
import { FormatView } from './views/format-view';
import { VisualView } from './views/visual-view';
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
    visual: { text: 'Build', title: 'Rebuild the picture from the input' }
};

/** The mode each tab selects, in the order they appear. */
const MODE_TABS: Array<[id: string, mode: Mode]> = [
    ['format-mode', 'format'],
    ['visual-mode', 'visual'],
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
    private readonly menus = new MenuHost();
    private readonly formatView: FormatView;
    private readonly diffView: DiffView;
    private readonly visualView: VisualView;
    private readonly state = new PanelStateStore();
    /**
     * One find control for the whole panel.
     *
     * It used to belong to the format view, which meant the picture had no way
     * to be searched at all. It drives whichever view is on screen instead.
     */
    private readonly find: FindWidget;
    private mode: Mode = 'format';

    constructor() {
        this.formatView = new FormatView(this.messenger);
        this.diffView = new DiffView(this.messenger);
        this.visualView = new VisualView(this.messenger);

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
        this.visualView.onStatusChange = status => {
            if (this.mode === 'visual') {
                this.statusBar.render(status);
            }
        };
        // One document, two renderers: the tree is handed what the format view
        // produced rather than parsing the same input again.
        this.formatView.onDocumentChange = (doc, diagnostics) => {
            this.visualView.setDocument(doc, diagnostics);
            this.find.refresh();
        };

        // Editing in the visual view rebuilds through the format view, since
        // that is what owns parsing; the picture renders what it produces.
        // Not recorded in history: a rebuild happens on every pause in typing,
        // and the documents on the way to the one they meant are not worth
        // keeping.
        this.visualView.onRebuildRequested = () => this.formatView.format(false);

        this.find = new FindWidget({
            ensureSearchable: () => this.searchTarget().ensureSearchable(),
            search: (term, options) => this.searchTarget().search(term, options),
            next: () => this.searchTarget().next(),
            previous: () => this.searchTarget().previous(),
            clear: () => this.searchTarget().clear(),
            position: () => this.searchTarget().position()
        });
    }

    public start(): void {
        this.labelModifierKeys();
        this.tooltips.start();
        this.menus.start();

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

        if (saved.showLineNumbers !== undefined) {
            this.formatView.setShowLineNumbers(saved.showLineNumbers);
        }
        if (saved.input) {
            this.formatView.restore(saved.input);
        }
        if (saved.leftJson || saved.rightJson) {
            this.diffView.restore(saved.leftJson ?? '', saved.rightJson ?? '', saved.strict);
        }

        // Last, so that coming back to the tree finds the document already
        // rebuilt rather than formatting an input box that is still empty.
        this.setMode(saved.mode);
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
        this.find.setDefaultScope(settings.searchScope);
        this.formatView.applySettings(settings);
        this.diffView.applySettings(settings);
        this.visualView.applySettings(settings);
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
        bind('search-toggle', () => this.find.toggle());
    }

    /**
     * Mode is a single attribute on <body>; CSS decides what each mode shows.
     * Nothing here touches element visibility directly.
     */
    private setMode(mode: Mode): void {
        // Told before the switch, so a rebuild it has queued is dropped rather
        // than firing from behind whichever view takes the screen.
        if (mode !== 'visual') {
            this.visualView.deactivate();
        }
        this.menus.close();

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

        // The control searches the document, which the diff view does not have.
        if (mode === 'diff') {
            this.find.close();
        } else {
            this.find.reset();
        }

        // The visual view shows the same document the format view does, so
        // switching to it formats first when nothing has been formatted yet --
        // rather than showing an empty pane until the user presses a button
        // they have not seen.
        if (mode === 'visual') {
            if (this.visualView.document === null) {
                this.formatView.format();
            }
            this.visualView.activate();
        }

        this.statusBar.render(this.activeView().getStatus());
    }

    /** Whichever view the find control should be searching. */
    private searchTarget(): Searchable {
        return this.mode === 'visual' ? this.visualView.searchable : this.formatView.searchable;
    }

    /** Whichever view the toolbar's shared buttons should act on. */
    private activeView(): { getStatus: () => StatusModel } {
        if (this.mode === 'diff') {
            return this.diffView;
        }
        return this.mode === 'visual' ? this.visualView : this.formatView;
    }

    private runAction(): void {
        if (this.mode === 'format') {
            this.formatView.format();
        } else if (this.mode === 'visual') {
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
        this.find.reset();
    }

    private copy(): void {
        if (this.mode === 'format') {
            this.formatView.copy();
        } else if (this.mode === 'visual') {
            this.visualView.copySubtree();
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
            when: () => !inDiff(),
            description: 'Find in the document',
            run: () => this.find.open()
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
        const inTree = () => this.mode === 'visual' && !isTyping();

        this.shortcuts.register({
            key: 'arrowdown',
            when: inTree,
            description: 'Next node',
            run: () => this.visualView.step(1)
        });
        this.shortcuts.register({
            key: 'arrowup',
            when: inTree,
            description: 'Previous node',
            run: () => this.visualView.step(-1)
        });
        this.shortcuts.register({
            key: 'arrowright',
            when: inTree,
            description: 'Expand, or move into the node',
            run: () => this.visualView.stepAcross(1)
        });
        this.shortcuts.register({
            key: 'arrowleft',
            when: inTree,
            description: 'Collapse, or move out to the parent',
            run: () => this.visualView.stepAcross(-1)
        });
        this.shortcuts.register({
            key: 'enter',
            when: inTree,
            description: 'Open or close the selected node',
            run: () => this.visualView.toggleSelected()
        });
        this.shortcuts.register({
            key: 'c',
            mod: true,
            shift: true,
            when: () => this.mode === 'visual',
            description: 'Copy the path of the selected node',
            run: () => this.visualView.copyPath()
        });

        this.shortcuts.start();
    }

    // ----------------------------------------------------------------- host

    private wireHostMessages(): void {
        this.messenger.on('loadJson', message => {
            this.setMode('format');
            this.formatView.load(message.json, message.remember);
        });
        this.messenger.on('loadDiff', message => {
            this.setMode('diff');
            this.diffView.load(message.leftJson, message.rightJson);
        });
        this.messenger.on('settings', message => this.applySettings(message.settings));
        this.messenger.on('themeColors', message => this.applyThemeColors(message.colors));
        this.messenger.on('setMode', message => this.setMode(message.mode));
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
