// design/contrast-audit.mjs — WCAG 2.1 contrast audit for the Neo-Noir palette.
// Usage: node design/contrast-audit.mjs   (zero dependencies)
// Formula: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (fg, bg) => {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
};
const grade = (r) =>
  r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA-large / UI only' : 'FAIL';

export const BG = {
  'bg.void': '#0A0A0C',
  'bg.surface': '#111116',
  'bg.elevated': '#18181F',
  'bg.overlay': '#1F1F28',
};

export const FG = {
  'text.primary': '#E6E6EB',
  'text.secondary': '#A3A3B0',
  'text.muted': '#7A7A88',
  'accent.cyan.500': '#00E5FF',
  'accent.cyan.300': '#7AF2FF',
  'accent.magenta.500': '#FF2BD6',
  'accent.magenta.300': '#FF8AE6',
  'decay.amber.500': '#FFB000',
  'decay.amber.300': '#FFD166',
  'decay.rust.500': '#C2410C',
  'decay.rust.300': '#F0844A',
  'status.success': '#3DFFA0',
  'status.danger': '#FF4D6A',
};

// Inverse text on filled (accent) surfaces
export const INVERSE = {
  'accent.cyan.500': '#00E5FF',
  'accent.magenta.500': '#FF2BD6',
  'decay.amber.500': '#FFB000',
  'decay.rust.500': '#C2410C',
  'status.success': '#3DFFA0',
  'status.danger': '#FF4D6A',
};

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const rows = [];
  for (const [fgName, fg] of Object.entries(FG))
    for (const [bgName, bg] of Object.entries(BG)) {
      const r = ratio(fg, bg);
      rows.push({ fg: fgName, bg: bgName, ratio: +r.toFixed(2), grade: grade(r) });
    }
  for (const [name, bg] of Object.entries(INVERSE)) {
    const r = ratio('#0A0A0C', bg);
    rows.push({ fg: 'text.inverse (#0A0A0C)', bg: name, ratio: +r.toFixed(2), grade: grade(r) });
  }
  console.table(rows);
}
