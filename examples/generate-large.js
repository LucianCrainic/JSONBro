/*
 * Writes a large document for exercising the paths the small examples cannot:
 * the off-thread format, the streamed read, and the virtualised output.
 *
 * Not committed, because a repository is the wrong place for twelve megabytes
 * that can be regenerated in a second. The output is gitignored.
 *
 *   node examples/generate-large.js        # ~12 MB, the size the README cites
 *   node examples/generate-large.js 40     # ~40 MB, for the diff ceiling
 */
const fs = require('fs');
const path = require('path');

const targetMb = Number(process.argv[2] || 12);
if (!Number.isFinite(targetMb) || targetMb <= 0) {
    console.error(`Wanted a size in MB, got "${process.argv[2]}".`);
    process.exit(1);
}

const out = path.join(__dirname, 'large.generated.json');
const target = targetMb * 1024 * 1024;

// Deterministic, so two runs produce the same file and a diff of one against
// another shows only what was meant to differ.
let seed = 7;
const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
};
const pick = list => list[Math.floor(random() * list.length)];

const names = ['Mechanical Keyboard', 'Wireless Mouse', 'Studio Headphones', 'USB-C Hub', 'Desk Mat'];
const cities = ['Bologna', 'Milan', 'Munich', 'Lyon', 'Porto'];

const stream = fs.createWriteStream(out);
stream.write('{\n  "orders": [\n');

let written = 0;
let i = 0;
while (written < target) {
    const record = {
        id: `evt_${String(i).padStart(7, '0')}`,
        sku: `SKU-${1000 + Math.floor(random() * 9000)}`,
        name: pick(names),
        quantity: 1 + Math.floor(random() * 5),
        unitPrice: Math.round(random() * 29500) / 100,
        inStock: random() > 0.3,
        tags: ['retail', 'eu', `batch-${i % 50}`],
        location: { city: pick(cities), code: `${10000 + Math.floor(random() * 89999)}` }
    };

    const text = (i === 0 ? '    ' : ',\n    ') + JSON.stringify(record);
    written += Buffer.byteLength(text);
    if (!stream.write(text)) {
        // Not awaited: the drain would make this async for no real gain at
        // these sizes, and the buffer high-water mark is only advisory.
    }
    i++;
}

stream.end('\n  ]\n}\n', () => {
    const { size } = fs.statSync(out);
    console.log(`${out}\n${i.toLocaleString()} records, ${(size / 1024 / 1024).toFixed(1)} MB`);
});
