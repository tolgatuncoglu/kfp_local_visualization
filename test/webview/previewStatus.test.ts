import { describe, expect, it } from 'vitest';
import { PreviewStatus } from '../../src/webview/previewStatus';

describe('webview status', () => {
  it('keeps a newer compile error visible when an older diagram render finishes', () => {
    const status = new PreviewStatus();
    status.graph();
    status.error('Python syntax error', true);
    expect(status.rendered(2, 1)).toBe('Out of date — Python syntax error');
  });

  it('keeps an error after changing the view of a stale graph, then clears it on success', () => {
    const status = new PreviewStatus();
    status.error('broken import', true);
    expect(status.graph('broken import')).toBe('Out of date — broken import');
    expect(status.rendered(2, 1)).toBe('Out of date — broken import');
    status.graph();
    expect(status.rendered(2, 1)).toBe('2 tasks · 1 links');
  });
});
