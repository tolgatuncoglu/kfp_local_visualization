import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';
import { initializeMermaid } from '../../src/webview/mermaidSetup';

describe('Mermaid preview limits', () => {
  it('accepts a graph above Mermaid\'s default 500-edge limit', async () => {
    initializeMermaid({ theme: 'base' });
    const source = `flowchart LR\n${Array.from({ length: 1_001 }, (_, index) => `a${index}-->b${index}`).join('\n')}`;
    await expect(mermaid.parse(source)).resolves.toMatchObject({ diagramType: 'flowchart-v2' });
    expect(mermaid.mermaidAPI.getConfig().maxEdges).toBeGreaterThanOrEqual(1_001);
  });

  it('configures Mermaid to accept the 51,684-character chain from the review', () => {
    initializeMermaid({ theme: 'base' });
    expect(mermaid.mermaidAPI.getConfig().maxTextSize).toBeGreaterThan(51_684);
  });
});
