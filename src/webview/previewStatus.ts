export class PreviewStatus {
  private override?: string;

  loading(): string {
    return this.override = 'Compiling pipeline…';
  }

  graph(staleError?: string): string | undefined {
    this.override = staleError ? `Out of date — ${staleError}` : undefined;
    return this.override;
  }

  error(message: string, stale: boolean): string {
    return this.override = `${stale ? 'Out of date — ' : ''}${message}`;
  }

  sizeWarning(): string {
    return this.override = 'Render paused';
  }

  rendered(nodeCount: number, edgeCount: number): string {
    return this.override ?? `${nodeCount} tasks · ${edgeCount} links`;
  }
}
