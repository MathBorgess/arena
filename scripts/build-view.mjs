import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({ entryPoints: [`${root}web/embedded.js`], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2023', minify: true });
const css = await readFile(`${root}web/style.css`, 'utf8');
const javascript = bundle.outputFiles[0].text.replaceAll('</script', '<\\/script');
await mkdir(`${root}dist`, { recursive: true });
await writeFile(`${root}dist/artifact-ui.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arena · artefato</title><style>${css}</style></head><body class="compact" data-channel="embedded"><main id="arena"></main><script type="module">${javascript}</script></body></html>`);
console.log('Built self-contained MCP Apps artifact resource.');
