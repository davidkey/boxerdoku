# Boxerdoku 🐶

A mobile-first logic puzzle web app. Place **one boxer in every row, column and
colored region**. Boxers can't touch each other, not even diagonally.

- **Daily puzzle** (7×7). The same board for everyone each day, with a streak counter.
- **Practice modes:** Easy 5×5, Medium 6×6, Hard 7×7, Expert 8×8, Master 9×9. You get unlimited new puzzles.
- Every puzzle is generated on the device and checked to have **exactly one solution**.
- Tap to cycle a cell through empty → 🐾 mark → 🐶 boxer. Drag to paint (or erase) marks.
- Undo, Clear and Hint. Optional auto-marking of blocked cells. Conflicting boxers are highlighted.
- Timer, best times and a share button. Progress is saved in `localStorage`.
- Installable PWA (Add to Home Screen) that works offline after the first visit.

No build step and no dependencies. It's plain HTML, CSS and JS.

## Run it

```sh
python3 -m http.server 8000            # then open http://localhost:8000
```

To play on your phone over Wi-Fi, run `python3 -m http.server 8000 --bind 0.0.0.0` and open
`http://<your-computer's-LAN-IP>:8000` on the phone. Installing it as an app and offline
play need HTTPS, so deploy it to any static host (GitHub Pages, Netlify, Cloudflare Pages, …).
Just upload the folder as is.

## Swapping in real boxer pictures

All artwork lives in **`js/theme.js`**. Each piece is either an emoji or an image:

```js
pieces: [
  { image: 'assets/boxers/fawn.png',    alt: 'Fawn boxer' },
  { image: 'assets/boxers/brindle.png', alt: 'Brindle boxer' },
  { image: 'assets/boxers/white.png',   alt: 'White boxer' },
],
mark: { image: 'assets/paw.svg', alt: '' },
logo: { image: 'assets/boxers/fawn.png', alt: 'Boxerdoku' },
```

- Put the files in `assets/boxers/`. Square PNG, WebP or SVG with a transparent background works best.
- With more than one entry in `pieces`, each colored region gets its own boxer.
- `mark`, `logo` and `celebrate` (the win confetti) accept the same `{emoji}` / `{image}` format.
- If you add images, also list them in `SHELL` in `sw.js` so they work offline, and bump `CACHE`.

## Files

| File | What it does |
| --- | --- |
| `js/theme.js` | Artwork, app name and region colors. **Edit this to reskin the app.** |
| `js/generator.js` | Seeded puzzle generator and solver (also runs in Node) |
| `js/game.js` | UI, input, timer, stats and persistence |
| `css/styles.css` | Styles (light and dark mode) |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA support |
| `tests/smoke.html` | Browser smoke test. Open it in a fresh/private window with the server running. |
