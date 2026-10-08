import {palette} from '../color';
import {styleLabel, type StyleSettings} from '../settings';
import type {Pattern} from './model';
import {MAX_EXPORT_PIXELS} from './limits';
export const labelFont = (size: number) => `bold ${size}px Arial, "Bead Labels", sans-serif`;
let fontReady: Promise<void> | undefined;
export function loadLabelFont(): Promise<void> {
  if (!fontReady) fontReady = (async () => {
    const font = new FontFace('Bead Labels', 'url("./assets/label-bold.woff2")', {weight: '700'});
    await font.load();
    (globalThis as unknown as {fonts: FontFaceSet}).fonts.add(font);
  })();
  return fontReady;
}
export function validatePattern(p: Pattern) {
  if (!Number.isInteger(p.width) || !Number.isInteger(p.height) || p.width < 1 || p.height < 1 || p.width > 200 || p.height > 200 || !(p.indices instanceof Uint8Array) || p.indices.length !== p.width * p.height) throw Error('Invalid bead grid.');
  if (p.indices.some(i => i >= palette.length)) throw Error('Invalid palette index.');
}
export function drawPattern(context: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, pattern: Pattern, cell: number, labels: boolean, gridDisplay: StyleSettings['gridDisplay'], margin = 20) {
  const width = pattern.width * cell + 2 * margin, height = pattern.height * cell + 2 * margin;
  context.fillStyle = '#f5f3ee'; context.fillRect(0, 0, width, height);
  const grid = gridDisplay === 'adaptive' ? (cell < 60 ? 'subtle' : 'white') : gridDisplay;
  context.font = labelFont(Math.floor(cell * .42)); context.textAlign = 'center'; context.textBaseline = 'middle';
  for (let y = 0; y < pattern.height; y++) for (let x = 0; x < pattern.width; x++) {
    const color = palette[pattern.indices[y * pattern.width + x]], left = margin + x * cell, top = margin + y * cell;
    context.fillStyle = color.hex; context.fillRect(left, top, cell, cell);
    if (grid !== 'none') {
      context.strokeStyle = grid === 'white' ? '#fff' : '#000';
      context.lineWidth = grid === 'white' ? 2 : 1;
      const inset = context.lineWidth / 2;
      context.strokeRect(left + inset, top + inset, cell - 2 * inset, cell - 2 * inset);
    }
    if (labels) {
      context.fillStyle = color.rgb.reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0) / 255 > .58 ? '#111' : '#fff';
      context.fillText(color.code, left + cell / 2, top + cell / 2);
    }
  }
}
export async function exportPattern(pattern: Pattern, cell: number, labels: boolean, grid: StyleSettings['gridDisplay']) {
  validatePattern(pattern);
  if (!Number.isInteger(cell) || cell < 8 || cell > 160) throw Error('PNG cell size must be 8–160 pixels.');
  const width = pattern.width * cell + 40, height = pattern.height * cell + 40;
  if (width * height > MAX_EXPORT_PIXELS) throw Error('Final PNG exceeds 20 megapixels. Reduce pixels per bead; the bead grid will stay unchanged.');
  if (labels) await loadLabelFont();
  const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d', {alpha: false});
  if (!context) throw Error('PNG rendering is unavailable in this browser.');
  try {
    drawPattern(context, pattern, cell, labels, grid);
    const blob = await canvas.convertToBlob({type: 'image/png'});
    if (!blob.size) throw Error('The browser returned an empty PNG. Try a smaller cell size.');
    return {blob, filename: `bead_pattern_${pattern.width}x${pattern.height}_${styleLabel(pattern.settings)}_${labels ? 'final_labeled' : 'final_unlabeled'}_highres.png`};
  } finally { canvas.width = canvas.height = 1; }
}
