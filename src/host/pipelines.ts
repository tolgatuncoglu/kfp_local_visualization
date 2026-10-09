/** Finds common KFP decorator forms without importing or executing the source file. */
export function discoverPipelineNames(source: string): string[] {
  const dslAliases = new Set(['dsl']);
  const pipelineAliases = new Set(['pipeline']);
  for (const line of source.split(/\r?\n/)) {
    const dslImport = line.match(/^\s*from\s+kfp\s+import\s+dsl(?:\s+as\s+(\w+))?/);
    if (dslImport) dslAliases.add(dslImport[1] ?? 'dsl');
    const pipelineImport = line.match(/^\s*from\s+kfp\.dsl\s+import\s+pipeline(?:\s+as\s+(\w+))?/);
    if (pipelineImport) pipelineAliases.add(pipelineImport[1] ?? 'pipeline');
  }

  const result: string[] = [];
  let decorated = false;
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('@')) {
      const match = trimmed.match(/^@([\w.]+)(?:\s*\(|\s*$)/);
      const name = match?.[1];
      if (name && (
        pipelineAliases.has(name) ||
        [...dslAliases].some((alias) => name === `${alias}.pipeline`)
      )) decorated = true;
      continue;
    }
    const definition = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (definition) {
      if (decorated && !result.includes(definition[1])) result.push(definition[1]);
      decorated = false;
    } else if (trimmed && !decorated) {
      decorated = false;
    }
  }
  return result;
}
