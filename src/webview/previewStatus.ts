const MAX_SUMMARY = 200;

export function summarizeError(message: string): string {
  const lines = message.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const summary = lines.length === 0 ? '' : message.includes('Traceback') ? lines[lines.length - 1] : lines[0];
  return summary.length > MAX_SUMMARY ? `${summary.slice(0, MAX_SUMMARY - 1)}…` : summary;
}

export class PreviewStatus {
  private override?: string;

  loading(): string {
    return this.override = 'Compiling pipeline…';
  }

  graph(staleError?: string): string | undefined {
    this.override = staleError ? `Out of date — ${summarizeError(staleError)}` : undefined;
    return this.override;
  }

  error(message: string, stale: boolean): string {
    return this.override = `${stale ? 'Out of date — ' : ''}${summarizeError(message)}`;
  }

  sizeWarning(): string {
    return this.override = 'Render paused';
  }

  rendered(nodeCount: number, edgeCount: number): string {
    return this.override ?? `${nodeCount} tasks · ${edgeCount} links`;
  }
}
