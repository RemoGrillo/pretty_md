---
title: On Reading Well
tags: [typography, markdown]
---

# On Reading Well

A page of Markdown deserves the same care as a page of a book. **pretty.md** opens your `.md` files as a typeset page first — generous margins, a comfortable measure, real *italics* — and gets out of the way when you want to [edit the source](#editing).

## Why typography matters

> Typography exists to honor content.
> — Robert Bringhurst

Long lines tire the eye, cramped leading blurs paragraphs together, and a poor contrast turns reading into work. A good reading theme fixes all three without asking anything of the writer.[^1]

### What you get

- Seven themes, from *Classic* beige paper to a phosphor *Terminal*
- Bundled fonts: EB Garamond, Source Sans 3, Inter, Playfair Display, JetBrains Mono
- Live updates while you type in the source editor
- [x] Task lists you can tick right in the preview
- [ ] Your next idea here

#### Editing

Double-click any paragraph to jump to that line of the source.

> [!TIP]
> On the page, press `Ctrl+Shift+V` (or **Edit**) to open the source beside it.

```python
def measure(text: str, chars_per_line: int = 72) -> list[str]:
    """Break text into comfortable lines."""
    words, line, lines = text.split(), "", []
    for w in words:
        if len(line) + len(w) > chars_per_line:
            lines.append(line.rstrip()); line = ""
        line += w + " "
    return lines + [line.rstrip()]
```

| Theme      | Headings          | Body            |
|------------|-------------------|-----------------|
| Classic    | EB Garamond       | Source Sans 3   |
| Manuscript | EB Garamond       | EB Garamond     |
| Night      | Playfair Display  | Source Sans 3   |

---

That's all — now go and read something beautiful.

[^1]: Butterick's *Practical Typography* is a fine, free place to start.
