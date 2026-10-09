# KFP DAG Preview

A read-only VS Code preview for Kubeflow Pipelines v2. Open a Python pipeline and see its compiled DAG beside the code. The preview refreshes when you save the file. Mermaid is bundled, so no separate diagram extension or Kubeflow cluster is needed.

## Install

Install the local package with **Extensions: Install from VSIX…** in VS Code and select `kfp-dag-preview.vsix`. To build it from source, run `npm ci` and `npm run package`.

Install the KFP v2 SDK in the Python environment used for your pipeline:

```sh
python -m pip install 'kfp>=2,<3'
```

The extension looks for the `kfp` command beside the interpreter selected by the VS Code Python extension for the source file. If that extension is unavailable, set `kfpDagPreview.kfpExecutable` to the full CLI path, or put `kfp` on `PATH`. If a selected interpreter has no KFP CLI, select the intended environment or install KFP there.

## Preview a pipeline

1. Open a KFP v2 Python file in a trusted VS Code workspace.
2. Run **KFP: Preview DAG** from the editor title or Command Palette. Choose a pipeline function if prompted.
3. Inspect the DAG beside the Python editor. Save the file to compile and refresh again. **Refresh** runs a compile immediately.

The panel includes zoom and fit controls, a task detail list, nested group collapse controls, and **Copy Mermaid**. Copy Mermaid puts the standalone Mermaid flowchart source on the clipboard. The panel renders Mermaid itself; it does not depend on any Mermaid extension.

For a compiled KFP v2 PipelineSpec YAML file, run **KFP: Preview Compiled DAG**. This command reads the YAML directly.

If compilation fails after a successful preview, the last graph stays visible with an **Out of date** message. **Show compiler output** opens the full diagnostic. Graphs over 500 tasks or 1,000 links pause before rendering; select **Render anyway** to continue.

## Scope and safety

Compilation runs `kfp dsl compile` locally. KFP imports the Python module, so top-level Python code in that file can run during compilation. The extension requires a trusted workspace before compiling and starts save refresh only after you open a preview. It uses a temporary YAML file, removes it after each compile, and never submits a pipeline run or contacts a Kubeflow service.

The diagram shows the static compiled definition. It does not show runtime task states, actual loop iterations, or which conditional branch ran. KFP v1/Argo workflow YAML is outside the supported format.

## Development

Run `npm ci`, then `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:integration`. The VS Code integration check launches the installed VS Code application on macOS, opens a Python source file beside the preview, and verifies recompilation on save with a local fake CLI. The host unit tests cover trust rejection, failure retention, rapid saves, and size limits.

`test/fixtures/pipeline.py` is a real KFP v2 example with a nested pipeline and data and ordering links. Its test skips when `kfp` is unavailable. Set `KFP_CLI` to an installed CLI path to require the real compiler test; compiler failures then fail the test rather than skip it.

Package with `npm run package` and install the resulting `.vsix` using **Extensions: Install from VSIX…**. Marketplace publication is not required.

Verified during development: the VS Code host test opened the preview beside `pipeline.py` and observed a second compile after saving; the real KFP 2.17 CLI compiled the nested fixture; and the packaged VSIX installed successfully into a temporary VS Code profile.
