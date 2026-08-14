/**
 * Reading JSON colours out of a colour theme.
 *
 * The shapes here are the ones real themes use: `include` chains, scopes given
 * as arrays and as comma-separated strings, rules with no foreground, and
 * `editor.tokenColorCustomizations` layered on top.
 */
import { resolveSyntaxColors, type ThemeSource } from '../theme/token-colors';

/** A theme source backed by files held in memory. */
function sourceOf(
    files: Record<string, unknown>,
    options: {
        label?: string | undefined;
        customizations?: Record<string, unknown>;
        themes?: Record<string, string>;
    } = {}
): ThemeSource {
    const label = 'label' in options ? options.label : 'Test Theme';
    const themes = options.themes ?? { 'Test Theme': 'theme.json' };

    return {
        label,
        customizations: options.customizations,
        locate: name => themes[name] ?? null,
        // Themes reference siblings, which is all the include paths here need.
        resolve: (_from, relative) => relative.replace(/^\.\//, ''),
        read: async location => {
            const file = files[location];
            return file === undefined ? null : JSON.stringify(file);
        }
    };
}

const rule = (scope: unknown, foreground?: string) => ({
    scope,
    settings: foreground ? { foreground } : {}
});

describe('resolveSyntaxColors', () => {
    it('reads a colour for each part of a JSON document', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [
                        rule('support.type.property-name.json', '#9cdcfe'),
                        rule('string.quoted.double.json', '#ce9178'),
                        rule('constant.numeric.json', '#b5cea8'),
                        rule('constant.language.json', '#569cd6'),
                        rule('punctuation.separator.dictionary.pair.json', '#808080')
                    ]
                }
            })
        );

        expect(colors).toEqual({
            key: '#9cdcfe',
            string: '#ce9178',
            number: '#b5cea8',
            boolean: '#569cd6',
            null: '#569cd6',
            punctuation: '#808080'
        });
    });

    it('prefers the more specific of two matching rules', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [
                        rule('string', '#111111'),
                        rule('string.quoted.double', '#222222')
                    ]
                }
            })
        );

        expect(colors.string).toBe('#222222');
    });

    it('ignores a specific rule for a scope JSON does not use', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [
                        rule('string', '#111111'),
                        // A Python-only scope must not win over the general one.
                        rule('string.quoted.docstring.multi.python', '#999999')
                    ]
                }
            })
        );

        expect(colors.string).toBe('#111111');
    });

    it('accepts a scope written as a comma-separated string', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [rule('constant.numeric, constant.language', '#ff0000')]
                }
            })
        );

        expect(colors.number).toBe('#ff0000');
        expect(colors.boolean).toBe('#ff0000');
    });

    it('keys a descendant selector on its final element', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [rule('meta.structure.dictionary.json string.quoted.double', '#abcdef')]
                }
            })
        );

        expect(colors.string).toBe('#abcdef');
    });

    it('skips a rule that sets only a font style', async () => {
        const colors = await resolveSyntaxColors(
            sourceOf({
                'theme.json': {
                    tokenColors: [
                        rule('string.quoted.double.json', '#ce9178'),
                        { scope: 'string.quoted.double.json', settings: { fontStyle: 'italic' } }
                    ]
                }
            })
        );

        expect(colors.string).toBe('#ce9178');
    });

    describe('include chains', () => {
        const files = {
            'theme.json': {
                include: './base.json',
                tokenColors: [rule('string.quoted.double.json', '#overridden')]
            },
            'base.json': {
                tokenColors: [
                    rule('string.quoted.double.json', '#base'),
                    rule('constant.numeric.json', '#basenumber')
                ]
            }
        };

        it('inherits from the included theme', async () => {
            const colors = await resolveSyntaxColors(sourceOf(files));
            expect(colors.number).toBe('#basenumber');
        });

        it('lets the including theme override what it inherits', async () => {
            const colors = await resolveSyntaxColors(sourceOf(files));
            expect(colors.string).toBe('#overridden');
        });

        it('survives a theme that includes itself', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf({
                    'theme.json': {
                        include: './theme.json',
                        tokenColors: [rule('constant.numeric.json', '#b5cea8')]
                    }
                })
            );

            expect(colors.number).toBe('#b5cea8');
        });
    });

    describe('user customizations', () => {
        const files = {
            'theme.json': { tokenColors: [rule('string.quoted.double.json', '#themed')] }
        };

        it('lets textMateRules override the theme', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, {
                    customizations: {
                        textMateRules: [rule('string.quoted.double.json', '#custom')]
                    }
                })
            );

            expect(colors.string).toBe('#custom');
        });

        it('applies the `strings` shorthand', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, { customizations: { strings: '#shorthand' } })
            );

            expect(colors.string).toBe('#shorthand');
        });

        it('applies a block scoped to the active theme', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, {
                    customizations: {
                        '[Test Theme]': {
                            textMateRules: [rule('string.quoted.double.json', '#scoped')]
                        }
                    }
                })
            );

            expect(colors.string).toBe('#scoped');
        });

        it('ignores a block scoped to a different theme', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, {
                    customizations: {
                        '[Other Theme]': {
                            textMateRules: [rule('string.quoted.double.json', '#scoped')]
                        }
                    }
                })
            );

            expect(colors.string).toBe('#themed');
        });

        it('prefers the theme-scoped block over the unscoped one', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, {
                    customizations: {
                        textMateRules: [rule('string.quoted.double.json', '#unscoped')],
                        '[Test Theme]': {
                            textMateRules: [rule('string.quoted.double.json', '#scoped')]
                        }
                    }
                })
            );

            expect(colors.string).toBe('#scoped');
        });
    });

    describe('finding the theme', () => {
        const files = {
            'dark-modern.json': { tokenColors: [rule('constant.numeric.json', '#b5cea8')] }
        };

        /**
         * The built-in themes are declared with ids like `Dark Modern` but are
         * selected as `Default Dark Modern`, so matching only on the exact
         * setting value would miss the themes most people are using.
         */
        it('finds a built-in theme declared without the Default prefix', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(files, {
                    label: 'Default Dark Modern',
                    themes: { 'Dark Modern': 'dark-modern.json' }
                })
            );

            expect(colors.number).toBe('#b5cea8');
        });

        it('prefers an exact match over the stripped one', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf(
                    {
                        ...files,
                        'exact.json': { tokenColors: [rule('constant.numeric.json', '#exact')] }
                    },
                    {
                        label: 'Default High Contrast',
                        themes: {
                            'Default High Contrast': 'exact.json',
                            'High Contrast': 'dark-modern.json'
                        }
                    }
                )
            );

            expect(colors.number).toBe('#exact');
        });
    });

    describe('when the theme cannot be read', () => {
        it('returns nothing rather than throwing when no theme is set', async () => {
            await expect(resolveSyntaxColors(sourceOf({}, { label: undefined }))).resolves.toEqual(
                {}
            );
        });

        it('returns nothing when the theme is not installed', async () => {
            await expect(resolveSyntaxColors(sourceOf({}, { themes: {} }))).resolves.toEqual({});
        });

        it('returns nothing when the file is missing', async () => {
            await expect(resolveSyntaxColors(sourceOf({}))).resolves.toEqual({});
        });

        it('still applies customizations when the theme file is missing', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf({}, { customizations: { strings: '#custom' } })
            );

            expect(colors.string).toBe('#custom');
        });

        it('tolerates tokenColors given as a path to a tmTheme', async () => {
            const colors = await resolveSyntaxColors(
                sourceOf({ 'theme.json': { tokenColors: './theme.tmTheme' } })
            );

            expect(colors).toEqual({});
        });
    });

    it('parses a theme file containing comments and trailing commas', async () => {
        // Theme files are JSONC in practice, and plain JSON.parse rejects both.
        const jsonc = `{
            // the base palette
            "tokenColors": [
                { "scope": "constant.numeric.json", "settings": { "foreground": "#b5cea8" } },
            ],
        }`;

        const colors = await resolveSyntaxColors({
            label: 'Test Theme',
            customizations: undefined,
            locate: () => 'theme.json',
            resolve: (_from, relative) => relative,
            read: async () => jsonc
        });

        expect(colors.number).toBe('#b5cea8');
    });
});
