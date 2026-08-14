/**
 * Reads the active colour theme's JSON syntax colours.
 *
 * The panel used to colour JSON from `debugTokenExpression.*`, which is the
 * palette VS Code uses in the debugger's variables view. Almost no theme sets
 * those, so they fell back to the built-in defaults and the formatted output
 * looked identical whichever theme was chosen -- and never looked like the
 * editor sitting next to it.
 *
 * A colour theme is a JSON file the contributing extension ships, so the real
 * colours can simply be read. What comes back is fed to the webview as CSS
 * custom properties; `contributes.colors` supplies the fallback for the cases
 * this cannot resolve, so a failure here is cosmetic rather than fatal.
 */
import { ValueSink } from '../webview/engine/parse-sink';
import { parseInto } from '../webview/engine/recovering-parser';
import type { SyntaxColors } from '../shared/messages';

/**
 * The TextMate scope each part of a JSON document actually carries, most
 * specific first. The first scope a theme has a rule for wins.
 *
 * `true`, `false` and `null` all carry `constant.language.json` in VS Code's
 * JSON grammar, so a theme cannot colour them apart. Giving them the same
 * colour here is fidelity, not a shortcut -- it is what the editor shows.
 */
const SCOPES: Record<keyof SyntaxColors, string[]> = {
    key: [
        'support.type.property-name.json',
        'support.type.property-name',
        'meta.structure.dictionary.key.json',
        'meta.object-literal.key'
    ],
    string: ['string.quoted.double.json', 'string.quoted.double', 'string.quoted', 'string'],
    number: ['constant.numeric.json', 'constant.numeric', 'constant'],
    boolean: ['constant.language.json', 'constant.language.boolean', 'constant.language'],
    null: ['constant.language.json', 'constant.language.null', 'constant.language'],
    punctuation: [
        'punctuation.definition.dictionary.begin.json',
        'punctuation.separator.dictionary.pair.json',
        'punctuation.definition.string.begin.json',
        'punctuation.separator',
        'punctuation'
    ]
};

/** `editor.tokenColorCustomizations` shorthands that map onto a role. */
const SHORTHANDS: Partial<Record<keyof SyntaxColors, string>> = {
    string: 'strings',
    number: 'numbers'
};

/** Guards against a theme that includes itself, directly or in a cycle. */
const MAX_INCLUDE_DEPTH = 10;

interface TokenRule {
    scope: string[];
    foreground?: string;
}

/**
 * Everything this needs from the outside world.
 *
 * Locations are opaque strings so that resolving colours stays a pure function
 * over data -- the VS Code adapter lives in its own module, and the rules here
 * can be tested against a handful of theme files in memory.
 */
export interface ThemeSource {
    /** The `workbench.colorTheme` label, e.g. "Default Dark Modern". */
    label: string | undefined;
    /** The `editor.tokenColorCustomizations` value, if any. */
    customizations: Record<string, unknown> | undefined;
    /** Locates the file contributing `label`. */
    locate(label: string): string | null;
    /** Resolves an `include` against the file that declared it. */
    resolve(from: string, relative: string): string;
    /** Reads a theme file's text, or returns null when it cannot be read. */
    read(location: string): Promise<string | null>;
}

/**
 * Resolves the syntax colours for the active theme.
 *
 * Returns an empty object rather than throwing: every caller treats "no
 * colours" as "keep the declared defaults".
 */
export async function resolveSyntaxColors(source: ThemeSource): Promise<SyntaxColors> {
    const label = source.label;
    if (!label) {
        return {};
    }

    const entry = locate(source, label);
    const rules = entry ? await collectRules(entry, source, 0) : [];

    applyCustomizations(rules, source.customizations, label);

    const colors: SyntaxColors = {};
    for (const role of Object.keys(SCOPES) as Array<keyof SyntaxColors>) {
        const found = bestMatch(rules, SCOPES[role]);
        if (found) {
            colors[role] = found;
        }
    }
    return colors;
}

/**
 * Finds the theme file for what `workbench.colorTheme` holds.
 *
 * That setting does not always spell the theme the way its manifest does. The
 * built-in themes are declared with ids like `Dark Modern` but are selected as
 * `Default Dark Modern`, while `Default High Contrast` carries the prefix in
 * its id already -- so both spellings are tried. Getting this wrong would miss
 * exactly the themes most people use.
 */
function locate(source: ThemeSource, label: string): string | null {
    for (const candidate of candidateNames(label)) {
        const found = source.locate(candidate);
        if (found) {
            return found;
        }
    }
    return null;
}

/** The names a theme may be declared under, most likely first. */
export function candidateNames(label: string): string[] {
    const names = [label];
    if (label.startsWith('Default ')) {
        names.push(label.slice('Default '.length));
    }
    return names;
}

/**
 * Reads a theme file and everything it includes.
 *
 * An included theme is the base, so its rules come first and the including
 * file's rules override them -- the same order a single file's rules apply in.
 */
async function collectRules(
    location: string,
    source: ThemeSource,
    depth: number
): Promise<TokenRule[]> {
    if (depth > MAX_INCLUDE_DEPTH) {
        return [];
    }

    const text = await source.read(location);
    if (text === null) {
        return [];
    }

    // Theme files are JSONC: comments and trailing commas are common in them,
    // and this extension already owns a parser that tolerates both.
    const { value } = parseInto(text, new ValueSink());
    if (!isRecord(value)) {
        return [];
    }

    let rules: TokenRule[] = [];

    if (typeof value.include === 'string') {
        rules = await collectRules(source.resolve(location, value.include), source, depth + 1);
    }

    return rules.concat(readRules(value.tokenColors));
}

/** Normalises a theme's `tokenColors` array into flat rules. */
function readRules(raw: unknown): TokenRule[] {
    if (!Array.isArray(raw)) {
        // Can also be a path to a .tmTheme plist, which is not JSON and is not
        // supported here; the contributed defaults cover it.
        return [];
    }

    const rules: TokenRule[] = [];
    for (const item of raw) {
        if (!isRecord(item)) {
            continue;
        }
        const settings = isRecord(item.settings) ? item.settings : undefined;
        const foreground = settings && typeof settings.foreground === 'string'
            ? settings.foreground
            : undefined;
        if (!foreground) {
            continue;
        }

        rules.push({ scope: splitScopes(item.scope), foreground });
    }
    return rules;
}

/** A rule's scope may be a list, or one string holding a comma-separated list. */
function splitScopes(scope: unknown): string[] {
    const parts = Array.isArray(scope) ? scope : typeof scope === 'string' ? scope.split(',') : [];
    return parts
        .filter((part): part is string => typeof part === 'string')
        .map(part => part.trim())
        .filter(Boolean);
}

/** Folds the user's `editor.tokenColorCustomizations` over the theme's rules. */
function applyCustomizations(
    rules: TokenRule[],
    customizations: Record<string, unknown> | undefined,
    label: string
): void {
    if (!customizations) {
        return;
    }

    // Settings scoped to a theme by name apply only to that theme, and win
    // over the unscoped block.
    const scoped = customizations[`[${label}]`];
    for (const block of [customizations, isRecord(scoped) ? scoped : undefined]) {
        if (!block) {
            continue;
        }
        rules.push(...readRules(block.textMateRules));

        for (const [role, key] of Object.entries(SHORTHANDS)) {
            const value = block[key as string];
            if (typeof value === 'string') {
                rules.push({ scope: SCOPES[role as keyof SyntaxColors].slice(0, 1), foreground: value });
            }
        }
    }
}

/**
 * The colour for the most specific scope a rule covers.
 *
 * Specificity is how many dot-separated segments the rule's selector names, so
 * `string.quoted.double` beats a blanket `string`. Later rules win ties, since
 * a theme lists general rules before the exceptions to them.
 */
function bestMatch(rules: TokenRule[], targets: string[]): string | undefined {
    let best: string | undefined;
    let bestScore = -1;

    for (const rule of rules) {
        for (const selector of rule.scope) {
            // A descendant selector like `meta.embedded string` is keyed on
            // its final element; the context it names cannot be checked here.
            const leaf = selector.split(/\s+/).pop() ?? '';
            if (!leaf || leaf.startsWith('-')) {
                continue;
            }

            for (const target of targets) {
                if (target !== leaf && !target.startsWith(`${leaf}.`)) {
                    continue;
                }
                const score = leaf.split('.').length;
                if (score >= bestScore) {
                    bestScore = score;
                    best = rule.foreground;
                }
            }
        }
    }

    return best;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
