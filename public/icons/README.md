# App icons

`icon-source.svg` is the canonical brand mark. All PNG variants and the
favicon are generated from it by `scripts/generate-icons.mjs` using
[`sharp`](https://sharp.pixelplumbing.com/):

```bash
node scripts/generate-icons.mjs
```

Generated files (checked into `public/`):

| File                             | Size    | Purpose  |
| -------------------------------- | ------- | -------- |
| `icons/icon-192.png`             | 192×192 | any      |
| `icons/icon-512.png`             | 512×512 | any      |
| `icons/icon-maskable-512.png`    | 512×512 | maskable (rendered inside a 72% safe area with a warm-ivory frame so Android launchers can crop freely) |
| `icons/apple-touch-icon.png`     | 180×180 | iOS      |
| `../favicon.ico`                 | 32×32   | browser tab |

Re-run the script whenever the SVG source changes. Do NOT rename the SVG
to `.png` — that yields a broken icon on every device.
