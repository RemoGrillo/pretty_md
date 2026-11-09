# Changelog

## Unreleased

- Slides open more smoothly: the page dissolves under the first slide instead of disappearing at once.
- README: why pretty.md exists, badges, animated demos, install instructions for VSCodium.

## 0.3.0 — 2026-11-09

- **Slides**: present any Markdown file as a deck (play button in the editor title or the preview toolbar,
  **pretty.md: Present as Slides**, or right-click a file). Headings down to `prettyMd.slideLevel` (default `###`) and
  `---` lines start new slides.
  - Arrows on screen, keyboard (`→` `←` `Space` `Page Up/Down` `Home` `End`, `Esc` to leave) and swipe.
  - Slides glide in and their blocks rise one after another; nothing moves with *reduce motion* turned on.
  - Title and section slides are centred; slides under a section show its name above the title.
  - Long slides shrink to fit the screen, then scroll. Live updates while you edit; **Contents** jumps to the right slide.

## 0.2.0 — 2026-11-09

- pretty.md sidebar (open book icon in the Activity Bar):
  - **Appearance**: theme thumbnails with live preview on hover, text size, column width, open-by-default switch.
  - **Contents**: headings of the document you are reading or editing; click to jump (in the page and in the source).
  - **Markdown Files**: every `.md` in the workspace as a folder tree; click to read, or open to the side / as text.

## 0.1.0 — 2026-11-09

First release.

- Markdown files (`*.md`, `*.markdown`) open as a typeset page by default; diffs stay textual.
- Seven reading themes: Classic, Manuscript, Paper, Espresso, Night, Terminal, Editor.
- Bundled fonts: EB Garamond, Source Sans 3, Inter, Playfair Display, JetBrains Mono.
- Toolbar: theme picker with live preview, text size, table of contents, Edit.
- Edit source beside the preview with live updates and scroll sync; double-click a paragraph to jump to its line.
- Clickable task lists, GitHub alerts, footnotes, syntax highlighting, front matter, relative images and links.
- English and Italian UI.
