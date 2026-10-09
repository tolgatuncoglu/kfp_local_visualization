import { describe, expect, it } from 'vitest';
import { PreviewStatus, summarizeError } from '../../src/webview/previewStatus';

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

describe('error summaries', () => {
  const trace = 'Traceback (most recent call last):\n  File "a.py", line 1, in <module>\n    x\nNameError: name \'x\' is not defined\n\n';

  it('uses the exception line of a Python traceback', () => {
    const status = new PreviewStatus();
    expect(status.error(trace, true)).toBe("Out of date — NameError: name 'x' is not defined");
    expect(status.graph(trace)).toBe("Out of date — NameError: name 'x' is not defined");
    expect(status.error(trace, false)).toBe("NameError: name 'x' is not defined");
  });

  it('falls back to the first line and truncates long lines', () => {
    expect(summarizeError('first\nsecond')).toBe('first');
    const out = summarizeError('x'.repeat(5000));
    expect(out.length).toBe(200);
    expect(out.endsWith('…')).toBe(true);
    expect(summarizeError('')).toBe('');
  });
});
