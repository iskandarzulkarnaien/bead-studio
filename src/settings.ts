export const samplings = ['average', 'center', 'median', 'resize'] as const;
export const filters = ['nearest', 'box', 'bilinear', 'bicubic', 'lanczos'] as const;
export const distances = ['rgb', 'lab', 'weighted-lab'] as const;
export const dithers = ['none', 'floyd-steinberg', 'atkinson', 'ordered'] as const;
export const numericKeys = ['pre_blur', 'sharpen', 'gamma', 'contrast', 'saturation', 'dither_strength'] as const;
export type NumericKey = typeof numericKeys[number];
export interface StyleSettings {
  maxWidth: number; maxHeight: number; cellSize: number;
  sampling: typeof samplings[number]; resize_filter: typeof filters[number];
  distance: typeof distances[number]; dither: typeof dithers[number];
  pre_blur: number; sharpen: number; gamma: number; contrast: number;
  saturation: number; dither_strength: number; series: string;
  gridDisplay: 'none' | 'subtle' | 'white' | 'adaptive'; labels: boolean;
}
export type Ranges = Record<NumericKey, { min: number; max: number; step: number }>;
export const styleDefaults: StyleSettings = {
  maxWidth: 104, maxHeight: 104, cellSize: 40, sampling: 'average', resize_filter: 'box',
  distance: 'lab', dither: 'none', pre_blur: 0, sharpen: 0, gamma: 1, contrast: 1,
  saturation: 1, dither_strength: 100, series: 'ABCDEFGHM', gridDisplay: 'none', labels: false,
};
export const bounds: Record<NumericKey, [number, number]> = {
  pre_blur: [0, 10], sharpen: [0, 3], gamma: [.5, 2], contrast: [.5, 2], saturation: [0, 2], dither_strength: [0, 100],
};
export function validateStyle(raw: unknown): StyleSettings {
  if (!raw || typeof raw !== 'object') throw Error('Settings must be an object.');
  const s = raw as StyleSettings;
  for (const key of ['maxWidth', 'maxHeight', 'cellSize'] as const) {
    if (!Number.isInteger(s[key]) || s[key] < 1 || s[key] > (key === 'cellSize' ? 160 : 200)) throw Error(`Invalid ${key}.`);
  }
  for (const key of numericKeys) if (!Number.isFinite(s[key]) || s[key] < bounds[key][0] || s[key] > bounds[key][1]) throw Error(`Invalid ${key}.`);
  if (!samplings.includes(s.sampling) || !filters.includes(s.resize_filter) || !distances.includes(s.distance) || !dithers.includes(s.dither)) throw Error('Unknown generation mode.');
  if (typeof s.series !== 'string' || !/^[ABCDEFGHM]+$/.test(s.series)) throw Error('Choose at least one MARD series.');
  if (!['none', 'subtle', 'white', 'adaptive'].includes(s.gridDisplay) || typeof s.labels !== 'boolean') throw Error('Invalid rendering settings.');
  return Object.fromEntries(Object.keys(styleDefaults).map(key => [key, s[key as keyof StyleSettings]])) as unknown as StyleSettings;
}
const styleKeys = ['sampling', 'resize_filter', 'pre_blur', 'sharpen', 'gamma', 'contrast', 'saturation', 'distance', 'dither', 'dither_strength'] as const;
export function styleLabel(s: StyleSettings): string {
  return styleKeys.map(k => `${k.slice(0, 2)}-${typeof s[k] === 'number' ? (Number.isInteger(s[k]) ? s[k].toFixed(1) : String(s[k])).replaceAll('.', 'p') : s[k]}`).join('__');
}
export function parseStyle(name: string): Partial<StyleSettings> {
  if (typeof name !== 'string' || name.length > 2000) throw Error('Invalid style filename.');
  const clean = name.trim().split(/[\\/]/).pop()!.replace(/\.png$/i, '').replace(/_highres$/, '').replace(/_final_(?:unlabeled|labeled)$/, '');
  const label = clean.replace(/^(?:bead_pattern_)?\d+x\d+_/, '');
  const tokens = label.split('__');
  if (tokens.length !== styleKeys.length) throw Error('Paste a generated style filename or the complete style label.');
  const result: Record<string, unknown> = {};
  styleKeys.forEach((key, i) => {
    const prefix = key.slice(0, 2) + '-';
    if (!tokens[i].startsWith(prefix)) throw Error('Style setting order is invalid.');
    const value = tokens[i].slice(prefix.length);
    if (!value) throw Error('Style setting is empty.');
    result[key] = (numericKeys as readonly string[]).includes(key) ? Number(value.replaceAll('p', '.')) : value;
  });
  validateStyle({ ...styleDefaults, ...result });
  return result;
}
function rangeCounts(ranges: Ranges): Record<NumericKey, number> {
  return Object.fromEntries(numericKeys.map(key => {
    const r = ranges?.[key];
    if (!r || ![r.min, r.max, r.step].every(Number.isFinite) || r.step <= 0 || r.max < r.min || r.min < bounds[key][0] || r.max > bounds[key][1]) throw Error(`Invalid batch range: ${key}.`);
    const count = Math.floor((r.max - r.min) / r.step + 1e-8) + 1;
    if (count > 10000) throw Error('A batch range has too many steps.');
    return [key, count];
  })) as Record<NumericKey, number>;
}
export function batchCount(ranges: Ranges): number {
  const counts = rangeCounts(ranges);
  const count = 8 * 3 * (1 + 3 * counts.dither_strength) * numericKeys.filter(k => k !== 'dither_strength').reduce((n, k) => n * counts[k], 1);
  if (!Number.isSafeInteger(count) || count > 100000) throw Error('Batch exceeds 100,000 styles. Narrow the ranges.');
  return count;
}
export function* iterateBatch(base: StyleSettings, ranges: Ranges): Generator<StyleSettings> {
  validateStyle(base); batchCount(ranges);
  const counts = rangeCounts(ranges);
  function* numeric(s: StyleSettings, index: number): Generator<StyleSettings> {
    if (index === numericKeys.length) { yield s; return; }
    const key = numericKeys[index], r = ranges[key];
    const count = key === 'dither_strength' && s.dither === 'none' ? 1 : counts[key];
    for (let i = 0; i < count; i++) {
      const value = key === 'dither_strength' && s.dither === 'none' ? 100 : Number((r.min + i * r.step).toFixed(8));
      yield* numeric({ ...s, [key]: value }, index + 1);
    }
  }
  for (const sampling of samplings) for (const resize_filter of sampling === 'resize' ? filters : ['box'] as const) {
    for (const distance of distances) for (const dither of dithers) yield* numeric({ ...base, sampling, resize_filter, distance, dither, labels: false, gridDisplay: 'none' }, 0);
  }
}
export const presetValues: Record<string, number[][]> = {
  'Quick Baseline': [[0], [0], [1], [1], [1], [100]],
  'Soft / Atmospheric': [[.5], [0], [1], [.9], [.85], [75]],
  'Crisp / Graphic': [[0], [1], [1], [1.1], [1.05], [100]],
  'Muted Vintage': [[.5], [0], [.95], [.9], [.75], [50]],
  'Gamma Sweep': [[0], [0], [.9, 1.1, .1], [1], [1], [100]],
  'Texture Sweep': [[0, 1, .5], [0, 1, .5], [1], [1], [1], [100]],
};
export function preset(name: string): Ranges {
  const values = presetValues[name]; if (!values) throw Error('Unknown preset.');
  return Object.fromEntries(numericKeys.map((key, i) => [key, { min: values[i][0], max: values[i][1] ?? values[i][0], step: values[i][2] ?? (key === 'dither_strength' ? 25 : .1) }])) as Ranges;
}
