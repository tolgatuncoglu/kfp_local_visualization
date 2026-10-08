# KFP DAG Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable VS Code extension that previews a KFP v2 pipeline DAG beside its Python source and refreshes the graph on save.

**Architecture:** A VS Code host resolves a local KFP CLI, compiles Python to temporary PipelineSpec YAML, and parses it into a renderer-independent graph model. A bundled Mermaid adapter and webview render the graph; a per-panel controller owns save refresh, stale-result suppression, errors, and cleanup.

**Tech Stack:** TypeScript, VS Code Extension API, KFP v2 CLI, `yaml`, Mermaid.js, esbuild, Vitest, `@vscode/test-electron`, `@vscode/vsce`.

**Spec:** `docs/superpowers/specs/2026-10-08-kfp-dag-preview-design.md`

## Global Constraints

- Primary input is a KFP v2 Python DSL file; standard compiled PipelineSpec IR YAML is a secondary input.
- The Python preview opens only in a trusted VS Code workspace and refreshes on save after the user starts it.
- Compilation uses `kfp dsl compile --py <file> --output <temporary-yaml> --function <name>` with argument-array process execution, never a shell.
- The extension does not edit Python files, submit pipelines, call a KFP service, upload source, or request credentials.
- Mermaid.js is bundled; no other extension, account, or network service is needed for rendering.
- KFP v1/Argo YAML, runtime task status, actual loop iterations, and branch outcomes are outside version one.
- Graphs above 500 nodes or 1,000 edges require the user to select **Render anyway**.
- The deliverable is source plus a locally installable `.vsix`; Marketplace publication is outside scope.

## Review Focus

- A saved Python file with syntax or import errors retains the last good diagram and shows an **Out of date** diagnostic: Task 5 integration test.
- Rapid saves whose compiles finish out of order show only the newest graph: Task 5 controller test.
- Task labels containing quotes, brackets, HTML, or Unicode render as text without Mermaid injection: Task 2 escaping test.
- A multi-root workspace selects the Python environment for the previewed file rather than another folder: Task 3 resolver test.
- A PipelineSpec input with unknown optional fields but a valid root DAG still renders: Task 1 parser test.

---

## File map

- `package.json`, `tsconfig.json`, `esbuild.mjs`, `vitest.config.ts`, `.vscodeignore`: extension manifest, scripts, bundling, tests, package contents.
- `src/core/graph.ts`: graph types and PipelineSpec-to-graph extraction.
- `src/core/mermaid.ts`: graph-to-Mermaid text generation and escaping.
- `src/host/environment.ts`: KFP CLI resolution from the selected Python environment or setting.
- `src/host/compiler.ts`: KFP CLI invocation, temporary IR lifecycle, diagnostics, and cancellation.
- `src/host/pipelines.ts`: Python syntax scan for candidate pipeline functions.
- `src/host/previewController.ts`: per-panel state and save-triggered refresh orchestration.
- `src/host/extension.ts`: command registration, trust checks, output channel, and panel creation.
- `src/webview/index.ts`, `src/webview/index.css`: Mermaid rendering, zoom/fit, task details, status, and messages.
- `test/core/*.test.ts`, `test/host/*.test.ts`, `test/fixtures/*`: behavior checks and small KFP IR samples.
- `test/integration/*`: VS Code command, refresh, and trust smoke checks.
- `README.md`: install, use, environment selection, limits, and development.

### Task 1: Parse PipelineSpec into a graph model

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/core/graph.ts`, `test/core/graph.test.ts`, `test/fixtures/{simple,data,nested,conditional,loop}.yaml`.

**Interfaces:** Produce `parsePipelineSpec(yamlText: string): PipelineGraph`, where `PipelineGraph` has `root: GraphScope`, `nodeCount`, and `edgeCount`; `GraphScope` has `id`, `label`, `tasks: GraphTask[]`, `edges: GraphEdge[]`; `GraphTask` has `id`, `key`, `label`, `componentName`, `inputs`, optional `condition`, optional `iterator`, and optional `childScope`; `GraphEdge` has `from`, `to`, `kind: 'data' | 'order'`, and `labels: string[]`. Export `PipelineSpecError` for format errors.

- [ ] **Step 1: Write failing graph tests.** Assert one task per `root.dag.tasks` entry; distinct order and data edges; nested child scopes; condition/loop metadata; unknown optional fields ignored; malformed YAML and absent `root.dag` raise `PipelineSpecError`.
- [ ] **Step 2: Run `npm test -- test/core/graph.test.ts`.** Expect the new tests to fail because the parser does not exist.
- [ ] **Step 3: Implement `parsePipelineSpec` in `src/core/graph.ts`.** Use `yaml` to parse, validate only fields consumed, recursively follow `componentRef.name`, derive stable path-based IDs, and merge duplicate same-kind edges while retaining labels.
- [ ] **Step 4: Run `npm test -- test/core/graph.test.ts`.** Expect all graph tests to pass.
- [ ] **Step 5: Commit.** `git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/core/graph.ts test && git commit -m "feat: extract KFP pipeline graphs"`.

### Task 2: Generate safe Mermaid source

**Files:** Create `src/core/mermaid.ts`, `test/core/mermaid.test.ts`.

**Interfaces:** Consume `PipelineGraph` from Task 1. Produce `toMermaid(graph: PipelineGraph, collapsedScopeIds?: ReadonlySet<string>): string`; returned text begins with `flowchart LR`, represents child scopes as subgraphs, and uses different link styles for data and order edges.

- [ ] **Step 1: Write failing Mermaid tests.** Assert nodes, subgraphs, both edge styles, stable output order, collapsed scopes, and escaping of `"`, brackets, HTML, backticks, and Unicode in labels.
- [ ] **Step 2: Run `npm test -- test/core/mermaid.test.ts`.** Expect failure because `toMermaid` does not exist.
- [ ] **Step 3: Implement `toMermaid` in `src/core/mermaid.ts`.** Emit stable IDs from Task 1; keep displayed labels separate from IDs; encode untrusted labels as Mermaid-safe text; render parent-scope links against the parent task node.
- [ ] **Step 4: Run `npm test -- test/core/mermaid.test.ts`.** Expect all Mermaid tests to pass.
- [ ] **Step 5: Commit.** `git add src/core/mermaid.ts test/core/mermaid.test.ts && git commit -m "feat: render graphs as Mermaid source"`.

### Task 3: Select and compile Python pipelines

**Files:** Create `src/host/environment.ts`, `src/host/compiler.ts`, `src/host/pipelines.ts`, `test/host/{environment,compiler,pipelines}.test.ts`.

**Interfaces:** Produce `resolveKfpExecutable(fileUri: vscode.Uri, configuredPath?: string): Promise<string>`; `discoverPipelineNames(source: string): string[]`; and `compilePipeline(input: { filePath: string; functionName?: string; executable: string; signal?: AbortSignal }): Promise<string>` returning IR YAML text. `compilePipeline` owns its temporary file and removes it in `finally`.

- [ ] **Step 1: Write failing host tests.** Cover selected environment scoped to the file's workspace folder, configured executable fallback, PATH fallback, one/multiple/common aliased decorators, argument-array invocation, working directory, captured stderr, cancellation, and temporary-file removal.
- [ ] **Step 2: Run `npm test -- test/host`.** Expect failures for missing host modules.
- [ ] **Step 3: Implement environment resolution and syntax-only pipeline discovery.** Use the public `ms-python.python` environment API when installed; find `kfp` beside its resolved interpreter (`bin/kfp` or `Scripts/kfp.exe`), otherwise use the configured executable then PATH. Use a bounded Python syntax scan or equivalent parser without importing user source; manual function entry remains available in the UI.
- [ ] **Step 4: Implement `compilePipeline` with `child_process.spawn`.** Pass fixed argument-array flags, set `cwd` to the source directory, collect bounded stdout/stderr, respect cancellation, read the temporary YAML, and remove it.
- [ ] **Step 5: Run `npm test -- test/host` and `npm run typecheck`.** Expect pass.
- [ ] **Step 6: Commit.** `git add src/host test/host package.json package-lock.json && git commit -m "feat: compile pipelines with local KFP"`.

### Task 4: Build the bundled DAG panel

**Files:** Create `esbuild.mjs`, `src/webview/index.ts`, `src/webview/index.css`, `src/host/panel.ts`, `test/host/panel.test.ts`; update `package.json` scripts and `.vscodeignore`.

**Interfaces:** Produce `createDagPanel(sourceUri: vscode.Uri, callbacks: { refresh(): void; copyMermaid(): void; collapse(scopeId: string): void }): DagPanel`, where `DagPanel` exposes `showLoading()`, `showGraph(graph: PipelineGraph, mermaidSource: string)`, `showError(message: string, stale: boolean)`, and `dispose()`. Webview messages are a discriminated union of refresh, copy, select-task, collapse, and render-anyway actions.

- [ ] **Step 1: Write failing panel tests.** Assert that graph payloads, stale errors, size warnings, and copy requests produce the correct host/webview messages; unrecognized messages have no effect.
- [ ] **Step 2: Run `npm test -- test/host/panel.test.ts`.** Expect failure because the panel does not exist.
- [ ] **Step 3: Implement panel host and webview.** Bundle Mermaid locally with esbuild, load scripts through `asWebviewUri`, set a restrictive CSP, render SVG with `mermaid.render`, attach task selection by stable node IDs, and provide fit/zoom, details, refresh, copy, and collapse controls.
- [ ] **Step 4: Run `npm test -- test/host/panel.test.ts`, `npm run typecheck`, and `npm run build`.** Expect pass and bundled webview assets.
- [ ] **Step 5: Commit.** `git add esbuild.mjs src/webview src/host/panel.ts test/host/panel.test.ts package.json package-lock.json .vscodeignore && git commit -m "feat: add bundled DAG preview panel"`.

### Task 5: Wire commands and save refresh

**Files:** Create `src/host/previewController.ts`, `src/host/extension.ts`, `test/host/previewController.test.ts`, `test/integration/extension.test.ts`; update `package.json` commands, menus, settings, and trust capability.

**Interfaces:** Produce `activate(context: vscode.ExtensionContext): void`; register `kfpDagPreview.previewPython` and `kfpDagPreview.previewYaml`. `PreviewController` receives a source URI and selected function, listens for saves of that URI only, debounces 250 ms, tracks a monotonically increasing generation, and never applies a stale result.

- [ ] **Step 1: Write failing controller tests.** Assert initial explicit compile, refresh after a matching save, no refresh for other files, latest-result-only behavior after rapid saves, last-good-graph retention on compile error, cleanup on panel close, and the 500-node/1,000-edge render gate.
- [ ] **Step 2: Run `npm test -- test/host/previewController.test.ts`.** Expect failure because the controller does not exist.
- [ ] **Step 3: Implement controller and commands.** In Python mode, refuse execution in untrusted workspaces; offer a Quick Pick for multiple detected pipelines and manual function name; resolve KFP, compile, parse, and render. In YAML mode, read and parse the active file without Python. Route errors to the panel and an output channel.
- [ ] **Step 4: Add VS Code integration tests.** Assert command registration, side-by-side panel creation, save refresh via a stubbed compiler, and trust rejection. Run `npm run test:integration`; expect pass.
- [ ] **Step 5: Run `npm test`, `npm run typecheck`, and `npm run build`.** Expect pass.
- [ ] **Step 6: Commit.** `git add src/host/previewController.ts src/host/extension.ts test/host/previewController.test.ts test/integration package.json package-lock.json && git commit -m "feat: refresh DAG preview on save"`.

### Task 6: Document, package, and verify a real pipeline

**Files:** Create `README.md`, `test/fixtures/pipeline.py`, `test/integration/realPipeline.test.ts`; update `.vscodeignore` and `package.json` metadata.

**Interfaces:** Produce `npm run package` that writes a locally installable `.vsix`. The README gives install, usage, Python environment selection, trust behavior, copy source, and supported KFP formats.

- [ ] **Step 1: Write a representative KFP v2 Python fixture.** Include data and ordering dependencies plus a nested pipeline; assert its compiled IR produces the expected graph in a real-CLI integration test when `kfp` is available.
- [ ] **Step 2: Run the real-CLI test.** Expect either pass with the local KFP SDK or an explicit skip when KFP is absent; do not silently treat a compiler failure as a skip.
- [ ] **Step 3: Write README and package metadata.** Document that compilation executes imports, occurs on save only after preview opens, and never submits a run.
- [ ] **Step 4: Run `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run build`, and `npm run package`.** Expect all available tests to pass and a `.vsix` whose contents include compiled extension and webview assets but exclude test fixtures and development files.
- [ ] **Step 5: Install the `.vsix` in an Extension Development Host and manually confirm Python beside DAG, refresh on save, compile error state, and copy Mermaid source.** Record the observed result in the README development section.
- [ ] **Step 6: Commit.** `git add README.md test/fixtures/pipeline.py test/integration/realPipeline.test.ts package.json package-lock.json .vscodeignore && git commit -m "docs: package and verify KFP DAG preview"`.
