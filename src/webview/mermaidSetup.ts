import mermaid, { type MermaidConfig } from 'mermaid';

export function initializeMermaid(theme: MermaidConfig): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    flowchart: { htmlLabels: false },
    maxEdges: 10_000,
    maxTextSize: 2_000_000,
    ...theme,
  });
}
