// Theme catalogue. The actual styling lives in media/preview.css under
// html[data-theme="<id>"]; this list drives the settings enum, the theme
// picker in the preview toolbar and the "Select Theme" quick pick.

export interface ThemeInfo {
  id: string;
  label: string;
  description: string;
  /** Colours for the little "Aa" swatch in the theme menu. */
  swatch: { bg: string; fg: string; accent: string; font: 'serif' | 'sans' | 'display' | 'mono' | 'editor' };
}

export const THEMES: ThemeInfo[] = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Beige paper, dark brown ink, Garamond headings over a clean sans body',
    swatch: { bg: '#f4ecd8', fg: '#2e2014', accent: '#8c3b1f', font: 'serif' },
  },
  {
    id: 'manuscript',
    label: 'Manuscript',
    description: 'Book page: ivory paper, Garamond throughout, justified text',
    swatch: { bg: '#fffff8', fg: '#1b1b1b', accent: '#8a1c1c', font: 'serif' },
  },
  {
    id: 'paper',
    label: 'Paper',
    description: 'Crisp white page with a modern sans (Inter)',
    swatch: { bg: '#ffffff', fg: '#1f2328', accent: '#0a58ca', font: 'sans' },
  },
  {
    id: 'espresso',
    label: 'Espresso',
    description: 'Dark classic: roasted brown, cream ink, Garamond headings',
    swatch: { bg: '#211b16', fg: '#e8dcc6', accent: '#e0a96d', font: 'serif' },
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Deep blue night, gold accents, Playfair Display headings',
    swatch: { bg: '#12161f', fg: '#d5d9e0', accent: '#e5b567', font: 'display' },
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Monospace everywhere, phosphor green on black',
    swatch: { bg: '#0d1110', fg: '#c3cfc5', accent: '#6fdc8c', font: 'mono' },
  },
  {
    id: 'vscode',
    label: 'Editor',
    description: 'Follows your VS Code colour theme and fonts',
    swatch: {
      bg: 'var(--vscode-editor-background)',
      fg: 'var(--vscode-editor-foreground)',
      accent: 'var(--vscode-textLink-foreground)',
      font: 'editor',
    },
  },
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const DEFAULT_THEME = 'classic';
