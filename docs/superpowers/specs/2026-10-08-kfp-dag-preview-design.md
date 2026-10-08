# KFP DAG Preview for VS Code — design

Date: 2026-10-08

## Intent

Give a developer writing Kubeflow Pipelines v2 Python code a read-only DAG preview beside the source file. The preview updates after each save, so the developer can inspect the pipeline structure locally without submitting a run or deploying Kubeflow. The extension is also useful when an AI coding agent edits the Python file.

The primary input is a Python source file. The KFP compiler, rather than a source-code heuristic, determines the actual pipeline graph. The extension bundles a Mermaid renderer, so no separate Mermaid extension or account is required. A user can copy the generated Mermaid source for use elsewhere.

## User workflow

1. Open a Python file containing a KFP v2 `@dsl.pipeline` definition in a trusted VS Code workspace.
2. Run **KFP: Preview DAG** from the command palette or editor title menu. If more than one pipeline is detected, choose one. An explicit function-name entry is available when detection is ambiguous.
3. The extension opens a preview panel beside the Python editor. It compiles the selected pipeline locally to a temporary IR YAML file, extracts its static graph, and renders that graph with bundled Mermaid.js.
4. Every subsequent save of that Python file triggers a new compile and refresh. A short debounce coalesces rapid saves. A generation counter prevents an older compile from replacing a newer result. Closing the preview stops watching and cancels pending work where possible.
5. The panel offers **Refresh**, **Copy Mermaid source**, zoom/fit controls, and a task detail view. Task details show the task name, referenced component, input names and sources, and explicit dependencies from the IR.

The preview never edits source files and never submits a pipeline to a cluster. It represents the compiled definition, not an execution trace: task status, actual loop iterations, and branch outcomes are unavailable.

## Inputs and compatibility

- Version one targets KFP v2 Python DSL and its standard compiled PipelineSpec IR YAML (`root.dag`, `components`). It does not parse KFP v1/Argo workflow YAML.
- The extension uses the active Python environment selected by the VS Code Python extension when available. It locates that environment's `kfp` CLI. If the Python extension is unavailable, a user setting supplies the `kfp` executable path, with `kfp` on `PATH` as the final fallback.
- Compilation uses the documented `kfp dsl compile --py <file> --output <temporary-yaml> --function <name>` command. The child process runs with the Python file's directory as its working directory. Arguments are passed as an array, without a shell.
- A file with a single pipeline can compile without a function selector. For multiple pipelines, the extension offers names found by a syntax-only scan of common decorator forms. The manual function-name entry handles aliases or patterns the scan cannot recognize.
- Reading an already compiled v2 IR YAML is a secondary command, **KFP: Preview Compiled DAG**, and uses the same graph parser and panel. It does not invoke Python.

## Graph model and rendering

The parser converts PipelineSpec into a renderer-independent model of scopes, tasks, and edges. Each DAG scope has stable, escaped IDs derived from its component/task path. The root scope comes from `root.dag`; nested scopes come from tasks whose `componentRef.name` resolves to a component containing `dag`.

Within each scope:

- Each entry in `dag.tasks` becomes a task node. Display labels prefer `taskInfo.name`, falling back to the task key.
- Each `dependentTasks` entry becomes an ordering edge.
- A task input whose `taskOutputParameter.producerTask` or `taskOutputArtifact.producerTask` names an upstream task becomes a data edge. Its label identifies the relevant input and, where available, output key.
- Duplicate edges between the same tasks are grouped for readability while retaining their labels in task details.
- A task with a nonempty `triggerPolicy.condition` receives a condition badge. A task with `parameterIterator` or `artifactIterator` receives a loop badge. A nondefault trigger strategy appears in task details. These marks describe static structure only.
- A task referencing a nested DAG appears as a grouped region with its child tasks. Parent-scope edges terminate at the parent task boundary. The user can collapse a region for large graphs.

The Mermaid adapter emits a `flowchart LR` diagram with subgraphs for nested DAGs, distinct styles for data and ordering edges, and labels escaped as text. The webview bundles the Mermaid runtime and uses a restrictive content security policy. Graph extraction remains separate from Mermaid generation so future renderers or exports can reuse it.

## States and errors

- First compile: show a progress indicator.
- Successful compile: replace the graph and clear the prior error.
- Compile or parse failure after a successful render: retain the last successful graph, mark it **Out of date**, and show a concise diagnostic with a link to full compiler output in a VS Code output channel.
- Failure before any successful render: show the diagnostic in place of the graph.
- Missing KFP CLI: show the selected environment/path and a command to install `kfp` there or configure the executable path.
- Invalid/unsupported IR: show an explicit format error. Unknown optional fields do not prevent a preview.
- Graphs exceeding 500 nodes or 1,000 edges show a size warning and a **Render anyway** action. A render is never started automatically above those thresholds.

## Trust and data handling

Compiling a Python pipeline imports and executes local Python module code. The extension declares that it does not support VS Code Restricted Mode, checks workspace trust before invoking the compiler, and begins automatic save refresh only after the user explicitly opens a Python preview. It never invokes a shell, uploads source, calls a KFP service, or requests credentials. The compiled YAML lives in an OS temporary directory and is removed when the preview closes or the extension deactivates. The extension may display compiled metadata in its local webview; source text is not sent to the webview.

The compiled-YAML preview is read-only and does not execute Python, but version one keeps a single trust policy for both commands to avoid ambiguous behavior.

## Project structure

The extension project lives at the root of the `kfp_local_visualization` repository, outside the read-only `sources/` mirror of the ChatGPT project.

- `src/extension/`: VS Code commands, environment resolution, compilation, document-save orchestration, and panel lifecycle.
- `src/core/`: PipelineSpec validation, graph extraction, and Mermaid generation; no VS Code dependencies.
- `src/webview/`: bundled Mermaid rendering, interactions, theme integration, and task details.
- `test/fixtures/`: small compiled KFP v2 examples covering simple, data, ordering, nested, conditional, and loop structures.
- `docs/`: usage and development instructions.

The deliverable is extension source plus a locally installable `.vsix`. Marketplace publication is outside the initial scope.

## Verification and acceptance

Automated checks cover PipelineSpec parsing, every supported edge type, nested scopes, Mermaid escaping, invalid input, and the rule that only the newest compile result can update the panel. VS Code integration checks cover the preview command, save-triggered refresh, missing CLI diagnostics, and trust gating. Packaging produces a `.vsix` that can be installed locally.

The first version is accepted when a developer can open a representative KFP v2 Python pipeline, start its preview, save a dependency change, and see the updated DAG beside the source without running Kubeflow; when a compiler failure leaves the last good graph visible with an error; and when **Copy Mermaid source** produces a valid standalone Mermaid flowchart.

## References

- [KFP compilation and IR](https://www.kubeflow.org/docs/components/pipelines/user-guides/core-functions/compile-a-pipeline/)
- [KFP CLI compile command](https://www.kubeflow.org/docs/components/pipelines/user-guides/core-functions/cli/)
- [PipelineSpec schema](https://github.com/kubeflow/pipelines/blob/master/api/v2alpha1/pipeline_spec.proto)
- [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview)
- [VS Code Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
