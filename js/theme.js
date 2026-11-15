/*
 * ============================================================
 *  THEME — swap artwork here. Nothing else needs to change.
 * ============================================================
 *
 * Every visual "piece" is either an emoji or an image:
 *
 *   { emoji: '🐶' }
 *   { image: 'assets/boxers/fawn.png', alt: 'Fawn boxer' }
 *
 * Images can be PNG / JPG / SVG / WebP. Square images with a transparent
 * or plain background look best; they're scaled to fit each cell.
 *
 * `pieces` is a list: if you provide more than one, each colored region of
 * the board gets its own piece (e.g. a fawn boxer, a brindle boxer, a white
 * boxer…). With a single entry, every boxer looks the same.
 */
window.BOXER_THEME = {
  appName: 'Boxerdoku',

  // The piece the player places on the board.
  pieces: [
    { image: 'assets/boxers/boxer.png', alt: 'Boxer' },
    // More pictures (drop files into assets/boxers/) give each region its own boxer:
    // { image: 'assets/boxers/fawn.png',    alt: 'Fawn boxer' },
    // { image: 'assets/boxers/brindle.png', alt: 'Brindle boxer' },
    // { image: 'assets/boxers/white.png',   alt: 'White boxer' },
  ],

  // The "not here" marker the player taps/drags onto cells.
  mark: { emoji: '🐾' },

  // Shown in the title bar and the win screen.
  logo: { image: 'assets/boxers/boxer.png', alt: '' },

  // Rains down when a puzzle is solved.
  celebrate: [{ image: 'assets/boxers/boxer.png', alt: '' }, { emoji: '🦴' }, { emoji: '🐾' }, { emoji: '🎾' }],

  // Pastel region colors (cycled if the board has more regions than colors).
  regionColors: [
    '#f6c9a8', // fawn
    '#c9e4c5', // sage
    '#bcd7f5', // sky
    '#f5c2d6', // pink
    '#f3e3a1', // butter
    '#d6c8f2', // lavender
    '#a9e0dc', // teal
    '#f2b8b0', // salmon
    '#d9d2c3', // stone
    '#c4e8a8', // lime
  ],
};

/* Helpers used by the game to render any theme piece. */
window.ThemeRender = {
  /** Build a DOM node for an {emoji} or {image} piece. */
  node(piece, className) {
    if (piece && piece.image) {
      const img = document.createElement('img');
      img.src = piece.image;
      img.alt = piece.alt || '';
      img.draggable = false;
      img.className = className + ' is-image';
      return img;
    }
    const span = document.createElement('span');
    span.textContent = (piece && piece.emoji) || '?';
    span.className = className + ' is-emoji';
    span.setAttribute('aria-hidden', 'true');
    return span;
  },
  /** Plain text version (used in share text). Images fall back to 🐶. */
  text(piece) {
    return (piece && piece.emoji) || '🐶';
  },
  pieceForRegion(theme, region) {
    return theme.pieces[region % theme.pieces.length];
  },
};
