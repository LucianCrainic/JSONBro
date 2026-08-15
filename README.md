<p align="center">
  <img src="https://raw.githubusercontent.com/LucianCrainic/JSONBro/6a0f58656221202173c696edff312eecd7bc5a30/images/banner.png" alt="JSONBro — JSON diffs, formatting, validation and visuals for VS Code" width="100%">
</p>

<h1 align="center">JSONBro for Visual Studio Code</h1>

<p align="center">
  <strong>Format it. Picture it. Compare it.</strong><br>
  A fast, focused workbench for JSON—without leaving your editor.
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=LucianDCrainic.jsonbro"><img src="https://vsmarketplacebadges.dev/version-short/LucianDCrainic.jsonbro.png?style=for-the-badge&amp;color=00BFEA&amp;labelColor=0A192F" alt="Visual Studio Marketplace version"></a>
  <a href="https://github.com/LucianCrainic/JSONBro/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/LucianCrainic/JSONBro/release.yml?style=for-the-badge&amp;logo=githubactions&amp;logoColor=white&amp;label=Release&amp;labelColor=0A192F" alt="Release pipeline status"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=LucianDCrainic.jsonbro"><img src="https://vsmarketplacebadges.dev/installs-short/LucianDCrainic.jsonbro.png?style=for-the-badge&amp;color=00BFEA&amp;labelColor=0A192F" alt="Visual Studio Marketplace installs"></a>
  <img src="https://img.shields.io/badge/VS%20Code-%E2%89%A51.81-007ACC?style=for-the-badge&amp;logo=visualstudiocode&amp;logoColor=white&amp;labelColor=0A192F" alt="Requires Visual Studio Code 1.81 or newer">
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=LucianDCrainic.jsonbro"><strong>Install from the Marketplace →</strong></a>
</p>

---

## Why JSONBro

You paste a minified API response into a scratch file. It's one line, 400 KB, and one of the quotes is wrong. Your editor tells you it's invalid and stops there.

JSONBro **repairs it, shows you what it repaired, and gets out of the way.**

- **It fixes JSON, it doesn't grade it.** Single quotes, trailing commas, `True`/`None`, unquoted keys, an unterminated string at the end—all recovered, with every repair listed and clickable.
- **It doesn't fall over on big files.** Documents are streamed and rendered a screen at a time. Tested on a **12 MB, 1.3-million-line** document with a million nodes.
- **It looks like your editor.** Syntax colours are read from your *actual* colour theme, not approximated—Dracula looks like Dracula.
- **It stays out of your way.** Everything is one panel, one keystroke, and no file on disk unless you ask for one.

---

## Three ways to look at a document

### Format

<!-- Pinned by commit, like the banner: the Marketplace renders this README
     from a copy of its own and will not resolve a relative path. Retaking a
     shot means committing it and repointing the pin at the new commit.
     A recording belongs here eventually — paste, ⌘⏎, click a repair, ⌘F. -->
<p align="center">
  <img src="https://raw.githubusercontent.com/LucianCrainic/JSONBro/b31c61e46853c5625d71e09989a4b870440ee21f/images/format.png" alt="Formatting a broken JSON document and reviewing the repairs" width="100%">
</p>

Paste on the left, read on the right. Folding, line numbers, and a find bar that can search **keys only**, **values only**, or both. Anything that had to be repaired is listed above the output—click a repair to jump to the line it came from.

### Visual

<!-- The still shows the tree; a recording is what shows tree → graph,
     the drag and the zoom, and copying a node's path. -->
<p align="center">
  <img src="https://raw.githubusercontent.com/LucianCrainic/JSONBro/b31c61e46853c5625d71e09989a4b870440ee21f/images/visual.png" alt="The same document drawn as a collapsible tree beside its source" width="100%">
</p>

The same document drawn instead of written—as an indented **tree** or as a **graph** of boxes and links. Expand and collapse from either, walk it with the arrow keys, and copy any node's path, value or whole subtree. The formatted source sits beside the picture, and you can edit it there without leaving.

### Diff

<!-- A recording would add what a still cannot: clicking a change to light it
     up in both panes, applying one, then saving the result. -->
<p align="center">
  <img src="https://raw.githubusercontent.com/LucianCrainic/JSONBro/b31c61e46853c5625d71e09989a4b870440ee21f/images/diff.png" alt="Comparing two JSON documents, with every change listed by path" width="100%">
</p>

A real structural comparison, not a line diff: reordered keys are not changes, and array elements are matched by content rather than by position. Click any change to see exactly where it lives **in both panes**. Apply the ones you want to the original, then save the result.

---

## It knows about your files

<!-- Still shows the four sections; re-opening a history entry, pinning one and
     deleting several at once are all movement, and want a recording. -->
<p align="center">
  <img src="https://raw.githubusercontent.com/LucianCrainic/JSONBro/b31c61e46853c5625d71e09989a4b870440ee21f/images/sidebar.png" alt="The JSONBro sidebar: quick actions, recent files and both histories" width="100%">
</p>

- **Right-click any `.json`, `.jsonl`, `.ndjson` or `.txt`** in the Explorer to open it, or send it to either side of a diff. Select two and compare them in one step.
- **A sidebar** with quick actions, recent files, and separate format and diff histories. Pin what you want to keep, select several and delete them together.
- **History has a budget.** Identical documents are stored once, and the whole store is capped—so it never quietly grows into tens of megabytes of settings.

---

## Getting started

Install from the Marketplace, or:

```
ext install LucianDCrainic.jsonbro
```

Then open the Command Palette and run **JSONBro: Format JSON**—or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>J</kbd> (<kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>J</kbd> on macOS).

### Keyboard

| | |
|---|---|
| <kbd>Ctrl/⌘</kbd>+<kbd>Alt/⌥</kbd>+<kbd>J</kbd> | Format JSON |
| <kbd>Ctrl/⌘</kbd>+<kbd>Alt/⌥</kbd>+<kbd>V</kbd> | Visualise JSON |
| <kbd>Ctrl/⌘</kbd>+<kbd>Alt/⌥</kbd>+<kbd>D</kbd> | Diff JSON |
| <kbd>Ctrl/⌘</kbd>+<kbd>Alt/⌥</kbd>+<kbd>O</kbd> | Open a JSON file |

Inside the panel: <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd> runs the current action, <kbd>Ctrl/⌘</kbd>+<kbd>F</kbd> finds, <kbd>Ctrl/⌘</kbd>+<kbd>K</kbd> clears, and the arrow keys walk the tree. Every button says what it does—and its shortcut—on hover.

---

## Settings

Sensible out of the box. Everything below is optional.

<details>
<summary><strong>All settings</strong></summary>

<br>

| Setting | Default | What it does |
|---|---|---|
| `jsonbro.indentSize` | `2` | Spaces per level of indentation. |
| `jsonbro.showLineNumbers` | `true` | Line numbers beside formatted output. |
| `jsonbro.matchEditorTheme` | `true` | Colour JSON the way your colour theme colours it in the editor. |
| `jsonbro.defaultPaneRatio` | `0.5` | Share of the width given to the input pane. |
| `jsonbro.autoFormatOnPaste` | `false` | Format as soon as JSON is pasted in. |
| `jsonbro.search.defaultScope` | `all` | Whether find starts on keys, values, or both. |
| `jsonbro.strictDiff` | `false` | Start diffs in strict mode, ignoring keys only on the right. |
| `jsonbro.maxInlineSize` | `2 MB` | Above this, documents are formatted off the UI thread. |
| `jsonbro.diff.maxDocumentSize` | `25 MB` | Largest document the diff view will compare. |
| `jsonbro.diff.arrayAlignBudget` | `1000000` | Ceiling on array alignment before falling back to index matching. |
| `jsonbro.history.maxEntries` | `50` | Entries kept per history. |
| `jsonbro.history.maxEntrySize` | `128 KB` | Largest document stored whole; bigger ones keep a preview. |
| `jsonbro.history.maxTotalSize` | `5 MB` | Ceiling on everything history holds. |

</details>

---

## Good to know

- **Requires VS Code 1.81 or newer.** No other dependencies, and nothing leaves your machine.
- **Comparing is bounded.** A document of any size can be *displayed*, but comparing needs both sides in memory at once, which is what `jsonbro.diff.maxDocumentSize` guards.
- Found a bug or want something? [Open an issue](https://github.com/LucianCrainic/JSONBro/issues)—it's the fastest way to get it on the list.

<br>

<p align="center">
  <a href="https://github.com/LucianCrainic/JSONBro">Source</a> ·
  <a href="https://github.com/LucianCrainic/JSONBro/releases">Releases</a> ·
  <a href="https://github.com/LucianCrainic/JSONBro/issues">Issues</a> ·
  <a href="https://github.com/LucianCrainic/JSONBro/blob/main/LICENSE">MIT</a>
</p>
