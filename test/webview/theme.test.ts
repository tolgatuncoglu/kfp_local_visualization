import { describe, expect, it } from 'vitest';
import { readMermaidTheme, watchVsCodeTheme } from '../../src/webview/theme';

const style = (values: Record<string, string>) => ({
  getPropertyValue: (name: string) => values[name] ?? '',
});

describe('Mermaid VS Code theme', () => {
  it('uses editor colors for a dark diagram instead of Mermaid light defaults', () => {
    const config = readMermaidTheme(style({
      '--vscode-editor-background': '#1e1e1e',
      '--vscode-editor-foreground': '#d4d4d4',
      '--vscode-editorWidget-background': '#252526',
      '--vscode-editorWidget-border': '#606060',
      '--vscode-descriptionForeground': '#9d9d9d',
    }), true);
    expect(config.theme).toBe('base');
    expect(config.themeVariables).toMatchObject({
      darkMode: true,
      background: '#1e1e1e',
      primaryColor: '#252526',
      primaryTextColor: '#d4d4d4',
      nodeBorder: '#606060',
      clusterBkg: '#1e1e1e',
      defaultLinkColor: '#9d9d9d',
    });
  });

  it('uses light editor colors and blends translucent theme values to opaque Mermaid hex', () => {
    const config = readMermaidTheme(style({
      '--vscode-editor-background': '#ffffff',
      '--vscode-editor-foreground': '#202020',
      '--vscode-editorWidget-background': 'rgba(0, 0, 0, 0.1)',
    }), false);
    expect(config.themeVariables).toMatchObject({
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#e6e6e6',
      primaryTextColor: '#202020',
    });
  });

  it('watches VS Code theme attributes so a theme switch can rerender the diagram', () => {
    let changed: (() => void) | undefined;
    let options: MutationObserverInit | undefined;
    const Observer = class {
      constructor(callback: () => void) { changed = callback; }
      observe(_target: Node, value: MutationObserverInit) { options = value; }
      disconnect() {}
    } as unknown as typeof MutationObserver;
    let updates = 0;
    watchVsCodeTheme({} as HTMLElement, () => { updates++; }, Observer);
    expect(options?.attributeFilter).toContain('class');
    expect(options?.attributeFilter).toContain('data-vscode-theme-id');
    changed?.();
    expect(updates).toBe(1);
  });
});
