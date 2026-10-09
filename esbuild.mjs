import { build } from 'esbuild';
import { copyFile, mkdir, access } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
const extensionEntry = await access('src/host/extension.ts').then(
  () => 'src/host/extension.ts',
  () => 'src/host/panel.ts',
);
await build({
  entryPoints: [extensionEntry],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});
await build({
  entryPoints: ['src/webview/index.ts'],
  outfile: 'dist/webview.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
});
await copyFile('src/webview/index.css', 'dist/webview.css');
await build({
  entryPoints: ['test/integration/extension.test.ts'],
  outfile: 'dist/integration.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
});
