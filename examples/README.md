# Examples

Documents for exercising the extension while developing it. The **Run Extension**
launch configuration opens this folder in the Extension Development Host, so
they are in the Explorer as soon as it starts — right-click any of them to open
it, or send it to one side of a diff.

None of this ships: `.vscodeignore` keeps the folder out of the package.

| File | What it is for |
|---|---|
| `api-response.json` | An ordinary nested response. The default for formatting, the tree and the graph. |
| `needs-repair.json` | Minified onto one line, with single quotes, unquoted keys, `True`/`None`, trailing commas, and a string left unterminated at the end. Every repair the parser makes, in one document. |
| `diff-before.json` → `diff-after.json` | A pair for Diff. Keys are in a different order and the services are listed in a different order, neither of which is a change; a version, two replica counts and a flag did change, one service was added and one key removed. |
| `deeply-nested.json` | Fourteen levels down. For walking with the arrow keys, the breadcrumb, and how the graph handles a long thin document. |
| `arrays.json` | Arrays of objects, of scalars, of arrays, mixed, and empty. Shows elements named by position, and gives array alignment something to chew on in a diff. |
| `edge-cases.json` | Escapes, non-Latin text, combining characters, an empty key, `-0`, and integers past what a double holds exactly. What tends to break a renderer. |
| `events.ndjson` | Newline-delimited, one object per line. |
| `pasted.txt` | JSON that arrived in a `.txt`, which the extension also opens. |

## The large one

Anything above `jsonbro.maxInlineSize` is formatted off the UI thread, and a
file is streamed in rather than pasted. Neither path is reachable with the
documents above, so the big one is generated rather than committed:

```
node examples/generate-large.js
```

That writes `examples/large.generated.json` at about 12 MB — a million lines
formatted, which is the size the README cites. Pass a number for something else
(`node examples/generate-large.js 40`), for instance to push a diff past
`jsonbro.diff.maxDocumentSize`. The output is gitignored, and the generator is
deterministic, so regenerating gives the same bytes.
