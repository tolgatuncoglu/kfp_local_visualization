# CLAUDE.md

VS Code extension (`kfp-dag-preview`) that shows a read-only DAG of a Kubeflow Pipelines **v2** pipeline beside the Python source. It shells out to `kfp dsl compile`, parses the resulting PipelineSpec IR YAML, converts it to Mermaid, and renders it in a webview with bundled Mermaid. Not a Kubeflow client: it never talks to a cluster.

`README.md` is the source of truth for user-facing behavior. `docs/superpowers/` is the original design/plan and has **drifted** (it says `src/extension/`, the code is `src/host/`; plan checkboxes were never ticked). Treat it as history, not spec.

## Commands

```sh
npm ci
npm test                     # vitest, unit only (~1s). Integration test file is excluded in vitest.config.mts
npm run typecheck            # tsc --noEmit; covers src AND test
npm run build                # esbuild -> dist/{extension.js,webview.js,webview.css,integration.js}
npm run test:integration     # builds, then launches the real VS Code app (macOS path hardcoded; override with VSCODE_EXECUTABLE_PATH)
npm run package              # vsce runs `vscode:prepublish` (node esbuild.mjs --production) -> kfp-dag-preview.vsix (gitignored)
npx vitest run test/core/graph.test.ts   # single file
```

There is no lint or formatter. CI (`.github/workflows/ci.yml`) runs typecheck, test, build and package on Linux and macOS; it does not run the VS Code integration test. Run `typecheck` + `test` before claiming done.

**The real-compiler tests are skipped by default** (need `kfp`). To actually exercise the parser against real IR:

```sh
python3 -m venv /tmp/kfpvenv && /tmp/kfpvenv/bin/pip install 'kfp>=2,<3'
KFP_CLI=/tmp/kfpvenv/bin/kfp npx vitest run test/integration/realPipeline.test.ts
```

If you change `src/core/graph.ts`, run this. The YAML fixtures in `test/fixtures/*.yaml` other than `real-stress.yaml` are hand-written, so they only prove the parser matches the author's idea of the schema, not KFP's.

## Architecture

Three layers; keep the dependency direction `webview` and `host` -> `core`, never the reverse.

- `src/core/` (pure, no `vscode`): `graph.ts` parses IR YAML into `PipelineGraph` (scopes -> tasks -> edges, recursive via `childScope`); `mermaid.ts` emits `flowchart LR`. Task ids are path strings like `root/exit-handler-1/for-loop-5/work`; Mermaid node ids are `n` + hex of that id (`mermaidNodeId`) so arbitrary task names can't break syntax. Labels go through `escapeLabel` (Mermaid `#NN;` entities).
- `src/host/` (extension host, Node): `extension.ts` registers `kfpDagPreview.previewPython` / `previewYaml`; `environment.ts` finds the `kfp` binary; `compiler.ts` spawns it (array args, `shell:false`, temp dir removed in `finally`); `previewController.ts` owns refresh logic; `changes.ts` builds the refresh trigger (VS Code saves + a `FileSystemWatcher` over `**/*.py` in the workspace folder, so external edits and imported modules refresh; YAML preview watches only its file); `panel.ts` creates the webview and is the only host file that touches the webview HTML/CSP; `pipelines.ts` is a regex scan for `@dsl.pipeline` names (never executes code).
- `src/webview/` (browser, bundled IIFE): `index.ts` wires DOM + Mermaid; `theme.ts` maps `--vscode-*` CSS vars to Mermaid theme variables; `previewStatus.ts`, `taskSelection.ts` are small pure helpers extracted for testing.

Host and webview talk by `postMessage` with `{type: ...}` objects. Message types are defined implicitly in two places (`DagPanel.receive` / `show*` in `panel.ts`, and the `switch` in `webview/index.ts`). There is no shared type, so change both together.

## Invariants to preserve

- **Newest compile wins.** `PreviewController` uses a `generation` counter plus `AbortController`; every `await` on `load` must re-check `generation` and `disposed` before touching the panel. Don't add a code path that updates the panel without that check.
- **Last good graph stays visible** on compile failure (marked "Out of date"). Don't clear `lastGraph` on error.
- **Size gate**: > 500 nodes or > 1000 edges pauses rendering until "Render anyway". `renderAnyway` resets on the next successful refresh.
- **Security posture**: webview CSP uses a per-panel nonce; Mermaid runs `securityLevel: 'strict'`, `htmlLabels: false`; all task text reaches the DOM via `textContent`. Keep it that way. Never use `innerHTML` for anything but the Mermaid SVG.
- **Trust**: compiling executes the user's Python. `package.json` declares `untrustedWorkspaces.supported: "limited"`: the YAML preview (runs no Python) works in Restricted Mode, the Python command checks `workspace.isTrusted`, and `kfpExecutable` is a restricted configuration. Never compile on activation, only after an explicit user command.
- Python preview only accepts `file:` URIs ending `.py`. The YAML preview additionally accepts `vscode-remote:`.

## Gotchas

- KFP names repeated component calls `work`, `work-2`, ... and synthesizes `condition-N`, `condition-branches-N`, `for-loop-N`, `exit-handler-N`. Since `mermaidNodeId` is hex of the full path, one task's id is routinely a **string prefix** of another's. Never match Mermaid node ids by substring: `webview/taskSelection.ts` (`parseMermaidNodeId`, `indexNodesByMermaidId`) matches exactly, keep it that way.
- `parseScope` drops edges whose `producerTask` / `dependentTasks` isn't a task in the same scope (Mermaid would otherwise invent ghost nodes). The names stay in `task.dependencies` / `input.sourceDescription`. Scope nesting deeper than `MAX_SCOPE_DEPTH` (64) throws `PipelineSpecError`.
- Compile errors reach the webview as the **full** stderr (up to 1 MB) in `Error.message`; the webview shows a summary (`summarizeError` in `previewStatus.ts`: last line of a traceback, max 200 chars) and the full text via "Show compiler output". Keep that contract.
- Refresh events from a save and from the file watcher both fire for the same edit; `PreviewController`'s 250 ms debounce coalesces them. Don't add a second debounce elsewhere.
- Compile has a 120 s default timeout (`timeoutMs`), stdin is ignored, and on POSIX the child runs in its own process group that is SIGKILLed on abort/timeout.
- Panels are deduped per `uri + functionName`; a repeat command calls `DagPanel.reveal()`.
- Tooling: `esbuild.mjs --production` (used by packaging) minifies both bundles and skips `dist/integration.js`; plain `npm run build` is the dev/test build. `webview.js` is ~5 MB because Mermaid is bundled whole. License is MIT (`LICENSE`); release notes go in `CHANGELOG.md` (bump `version` in `package.json` and run `npm install --package-lock-only` together). `activationEvents` is intentionally omitted (VS Code derives it from contributed commands). No marketplace icon exists yet.
- Unit tests mock `vscode` and the panel wholesale. `test/integration` runs in real VS Code (`--disable-workspace-trust`, fake `kfp` node script) but nothing in the suite renders Mermaid in a browser, so webview click/CSS changes are unverified by tests.
- `npm run test:integration` fails with `Cannot find module <tmpdir>` if the shell inherited `ELECTRON_RUN_AS_NODE`/`VSCODE_*` (e.g. launched from a VS Code terminal or Claude Code in VS Code). Unset them first: `bash -c 'for v in $(env | grep -oE "^(VSCODE_[A-Za-z0-9_]+|ELECTRON_RUN_AS_NODE)"); do unset $v; done; npm run test:integration'`.
- Real-KFP fixtures: `test/fixtures/real-stress.yaml` was compiled by KFP 2.17.0 from `stress_pipeline.py`; regenerate both together if you change either.

## Conventions

- TypeScript strict, ESM source, bundled to CJS (host) / IIFE (webview). Match the existing terse style: small functions, `type` over `interface`, minimal comments (only for non-obvious "why").
- Host code that must be unit-testable takes its `vscode`-touching pieces via injected dependencies (see `EnvironmentDependencies`, `PreviewOptions`); keep `require('vscode')` lazy so vitest can import the module.
- Commit style: conventional commits (`feat:`, `fix:`, `docs:`, `test:`).
