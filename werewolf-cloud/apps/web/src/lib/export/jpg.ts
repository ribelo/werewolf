import { toJpeg } from 'html-to-image';
import type { UnifiedTableExportModel } from './unified-table';

export interface CreateJpgOptions {
  title: string;
  subtitle?: string;
  generatedAtLabel?: string;
  /**
   * Override the pixel ratio used for rasterising the image.
   * Defaults to clamped window.devicePixelRatio for crisper output.
   */
  pixelRatio?: number;
}

interface Palette {
  primary: string;
  accent: string;
  border: string;
  card: string;
  surface: string;
  rowEven: string;
  rowOdd: string;
  textPrimary: string;
  textSecondary: string;
}

function resolvePalette(): Palette {
  const defaultPalette: Palette = {
    primary: '#DC143C',
    accent: '#FF0040',
    border: '#404040',
    card: '#1A1A1A',
    surface: '#000000',
    rowEven: '#1F1F1F',
    rowOdd: '#252525',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
  };

  if (typeof window === 'undefined') {
    return defaultPalette;
  }

  const getVar = (name: string): string | null => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim().length > 0 ? value.trim() : null;
  };

  return {
    primary: getVar('--color-primary') ?? defaultPalette.primary,
    accent: getVar('--color-accent') ?? defaultPalette.accent,
    border: getVar('--color-border') ?? defaultPalette.border,
    card: getVar('--color-card-bg') ?? defaultPalette.card,
    surface: getVar('--color-main-bg') ?? defaultPalette.surface,
    rowEven: getVar('--color-table-row-even') ?? defaultPalette.rowEven,
    rowOdd: getVar('--color-table-row-odd') ?? defaultPalette.rowOdd,
    textPrimary: getVar('--color-text-primary') ?? defaultPalette.textPrimary,
    textSecondary: getVar('--color-text-secondary') ?? defaultPalette.textSecondary,
  };
}

function createCell(
  content: string,
  kind: 'th' | 'td',
  palette: Palette,
  rowIndex?: number
): HTMLTableCellElement {
  const cell = document.createElement(kind);
  cell.style.padding = '12px 14px';
  cell.style.border = `1px solid ${palette.border}`;
  cell.style.whiteSpace = 'pre-wrap';
  cell.style.fontFamily = `'Inter', system-ui, sans-serif`;
  cell.style.fontSize = kind === 'th' ? '12px' : '11px';
  cell.style.letterSpacing = kind === 'th' ? '0.12em' : '0';
  cell.style.lineHeight = '1.4';
  cell.style.textAlign = 'left';
  cell.style.verticalAlign = 'top';
  cell.style.color = palette.textPrimary;

  if (kind === 'th') {
    cell.style.fontWeight = '600';
    cell.style.textTransform = 'uppercase';
    cell.style.background = `linear-gradient(135deg, ${palette.primary}, ${palette.accent})`;
    cell.style.color = '#0B0B0B';
    cell.style.boxShadow = `inset 0 -2px 0 0 rgba(0, 0, 0, 0.25)`;
  } else if (typeof rowIndex === 'number') {
    const background = rowIndex % 2 === 0 ? palette.rowEven : palette.rowOdd;
    cell.style.backgroundColor = background;
  }

  const segments = content.split('\n', 2);
  segments.forEach((segment, index) => {
    if (index > 0) {
      cell.appendChild(document.createElement('br'));
    }
    cell.appendChild(document.createTextNode(segment || ''));
  });

  return cell;
}

function buildTable(model: UnifiedTableExportModel, palette: Palette): HTMLTableElement {
  const table = document.createElement('table');
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';
  table.style.border = `1px solid ${palette.border}`;
  table.style.boxShadow = '0 6px 24px rgba(0, 0, 0, 0.45)';
  table.style.borderRadius = '8px';
  table.style.overflow = 'hidden';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const column of model.columns) {
    headerRow.appendChild(createCell(column.header, 'th', palette));
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  model.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    for (const column of model.columns) {
      const cellValue = row[column.key] ?? '';
      tr.appendChild(createCell(cellValue, 'td', palette, rowIndex));
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  return table;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const commaIndex = dataUrl.indexOf(',');
  const base64 = dataUrl.slice(commaIndex + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function createJpgBlob(
  model: UnifiedTableExportModel,
  options: CreateJpgOptions
): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('createJpgBlob must run in a browser context');
  }

  const palette = resolvePalette();
  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.top = '-10000px';
  root.style.left = '-10000px';
  root.style.background = palette.surface;
  root.style.padding = '48px';
  root.style.fontFamily = `'Inter', system-ui, sans-serif`;
  root.style.color = palette.textPrimary;

  const frame = document.createElement('div');
  frame.style.position = 'relative';
  frame.style.display = 'flex';
  frame.style.flexDirection = 'column';
  frame.style.gap = '24px';
  frame.style.padding = '36px';
  frame.style.background = palette.card;
  frame.style.border = `2px solid ${palette.border}`;
  frame.style.borderRadius = '20px';
  frame.style.boxShadow = '0 12px 48px rgba(220, 20, 60, 0.25)';
  frame.style.minWidth = '640px';
  frame.style.maxWidth = '1400px';
  frame.style.width = 'max-content';

  const accentBar = document.createElement('div');
  accentBar.style.position = 'absolute';
  accentBar.style.top = '0';
  accentBar.style.left = '0';
  accentBar.style.right = '0';
  accentBar.style.height = '6px';
  accentBar.style.background = `linear-gradient(90deg, transparent, ${palette.primary}, ${palette.accent}, transparent)`;
  frame.appendChild(accentBar);

  const heading = document.createElement('div');
  heading.style.display = 'flex';
  heading.style.flexDirection = 'column';
  heading.style.gap = '6px';

  const title = document.createElement('div');
  title.textContent = options.title;
  title.style.fontFamily = `'Bebas Neue', 'Inter', sans-serif`;
  title.style.fontSize = '42px';
  title.style.letterSpacing = '0.18em';
  title.style.textTransform = 'uppercase';
  title.style.margin = '0';
  heading.appendChild(title);

  if (options.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.textContent = options.subtitle;
    subtitle.style.fontFamily = `'Inter', system-ui, sans-serif`;
    subtitle.style.fontSize = '16px';
    subtitle.style.fontWeight = '500';
    subtitle.style.color = palette.textSecondary;
    subtitle.style.textTransform = 'uppercase';
    subtitle.style.letterSpacing = '0.12em';
    subtitle.style.margin = '0';
    heading.appendChild(subtitle);
  }

  frame.appendChild(heading);

  const table = buildTable(model, palette);
  frame.appendChild(table);

  if (options.generatedAtLabel) {
    const footer = document.createElement('div');
    footer.textContent = options.generatedAtLabel;
    footer.style.fontSize = '11px';
    footer.style.letterSpacing = '0.14em';
    footer.style.textTransform = 'uppercase';
    footer.style.color = palette.textSecondary;
    footer.style.display = 'flex';
    footer.style.alignItems = 'center';
    footer.style.gap = '8px';

    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = '6px';
    dot.style.height = '6px';
    dot.style.borderRadius = '999px';
    dot.style.background = palette.primary;
    footer.prepend(dot);
    frame.appendChild(footer);
  }

  root.appendChild(frame);
  document.body.appendChild(root);

  try {
    const pixelRatio =
      options.pixelRatio ?? Math.min(3, Math.max(2, window.devicePixelRatio || 2));
    const dataUrl = await toJpeg(frame, {
      cacheBust: true,
      backgroundColor: palette.surface,
      quality: 0.92,
      pixelRatio,
    });
    return dataUrlToBlob(dataUrl);
  } finally {
    root.remove();
  }
}
