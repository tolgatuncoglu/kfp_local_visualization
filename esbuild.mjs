import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';

// `--production` is used by `vscode:prepublish` (so `vsce package` is always a production build):
// it minifies the extension bundle and skips the VS Code integration-test bundle.
const production = process.argv.includes('--production');

await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/host/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  minify: production,
});
await build({
  entryPoints: ['src/webview/index.ts'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  minify: true,
});
await copyFile('src/webview/index.css', 'dist/webview.css');
if (!production) {
  await build({
    entryPoints: ['test/integration/extension.test.ts'],
    outfile: 'dist/integration.js',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['vscode'],
  });
}
