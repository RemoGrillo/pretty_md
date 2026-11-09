# pretty.md slides

Any Markdown file, presented — no new syntax to learn.

## How it splits

Every heading down to `###` starts a new slide, and so does a line with `---`.

### Moving around

- `→`, **Space** or **Page Down**: next slide
- `←` or **Page Up**: previous slide
- **Home** / **End**: first and last slide
- **Esc**: back to the page, right where the slide was

### Everything still works

| On a slide                  | Works |
|-----------------------------|:-----:|
| Highlighted code, copy button | ✓ |
| Tables, quotes, GitHub alerts | ✓ |
| Task lists you can tick       | ✓ |
| Live updates while you type   | ✓ |

### Long slides fit the screen

```ts
// text shrinks until the slide fits, then it scrolls
for (const slide of deck) {
  present(slide, { animate: !prefersReducedMotion });
}
```

> [!TIP]
> Change where slides break in **Settings › pretty.md › Slide Level**.

## Your theme comes along

> Typography exists to honor content.
> — Robert Bringhurst

---

That's the deck. Press **Esc** to go back to reading.
