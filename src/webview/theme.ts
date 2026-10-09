type ThemeStyle = Pick<CSSStyleDeclaration, 'getPropertyValue'>;
type Rgb = [number, number, number, number];

function parseColor(value: string): Rgb | undefined {
  const input = value.trim().toLowerCase();
  const hex = input.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      const channels = [...digits].map((digit) => parseInt(digit + digit, 16));
      return [channels[0], channels[1], channels[2], (channels[3] ?? 255) / 255];
    }
    if (digits.length === 6 || digits.length === 8) {
      return [
        parseInt(digits.slice(0, 2), 16),
        parseInt(digits.slice(2, 4), 16),
        parseInt(digits.slice(4, 6), 16),
        digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
      ];
    }
  }
  const rgb = input.match(/^rgba?\((.*)\)$/);
  if (!rgb) return undefined;
  const parts = rgb[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return undefined;
  const channels = parts.slice(0, 3).map((part) => part.endsWith('%') ? Number(part.slice(0, -1)) * 2.55 : Number(part));
  const alpha = parts[3]?.endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3] ?? 1);
  if (![...channels, alpha].every(Number.isFinite)) return undefined;
  return [channels[0], channels[1], channels[2], alpha];
}

function opaqueHex(value: string, fallback: string, over = fallback): string {
  const base = parseColor(over)!;
  const color = parseColor(value) ?? parseColor(fallback)!;
  const alpha = Math.min(1, Math.max(0, color[3]));
  return `#${color.slice(0, 3).map((channel, index) => {
    const blended = Math.round(channel * alpha + base[index] * (1 - alpha));
    return Math.min(255, Math.max(0, blended)).toString(16).padStart(2, '0');
  }).join('')}`;
}

export function readMermaidTheme(style: ThemeStyle, darkMode: boolean) {
  const background = opaqueHex(style.getPropertyValue('--vscode-editor-background'), darkMode ? '#1e1e1e' : '#ffffff');
  const foreground = opaqueHex(style.getPropertyValue('--vscode-editor-foreground'), darkMode ? '#d4d4d4' : '#242424');
  const linkColor = opaqueHex(style.getPropertyValue('--vscode-descriptionForeground'), foreground, background);
  const nodeBackground = opaqueHex(style.getPropertyValue('--vscode-editorWidget-background'), darkMode ? '#252526' : '#f3f3f3', background);
  const border = opaqueHex(
    style.getPropertyValue('--vscode-editorWidget-border') || style.getPropertyValue('--vscode-panel-border'),
    darkMode ? '#606060' : '#999999',
    background,
  );
  return {
    theme: 'base' as const,
    themeVariables: {
      darkMode,
      background,
      primaryColor: nodeBackground,
      primaryTextColor: foreground,
      primaryBorderColor: border,
      secondaryColor: nodeBackground,
      secondaryTextColor: foreground,
      secondaryBorderColor: border,
      tertiaryColor: background,
      tertiaryTextColor: foreground,
      tertiaryBorderColor: border,
      textColor: foreground,
      lineColor: linkColor,
      mainBkg: nodeBackground,
      nodeBorder: border,
      nodeTextColor: foreground,
      clusterBkg: background,
      clusterBorder: border,
      defaultLinkColor: linkColor,
      edgeLabelBackground: background,
      titleColor: foreground,
    },
  };
}

export function watchVsCodeTheme(
  body: HTMLElement,
  onChange: () => void,
  Observer: typeof MutationObserver = MutationObserver,
): MutationObserver {
  const observer = new Observer(onChange);
  observer.observe(body, {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-vscode-theme-id'],
  });
  return observer;
}
