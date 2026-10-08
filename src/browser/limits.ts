// Reject oversized sources; optional resizing is deferred in TASKS.md.
export const MAX_SOURCE_PIXELS = 16_000_000;
export const MAX_EXPORT_PIXELS = 20_000_000;
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const STYLE_OVERHEAD_ESTIMATE = 4096;
export const BATCH_WARNING_COUNT = 1000;
export const MAX_RETAINED_BYTES = 64 * 1024 * 1024;
export function estimateRetainedBytes(count: number, width: number, height: number): number {
  return count * (width * height + STYLE_OVERHEAD_ESTIMATE);
}
export function validateBatchBudget(count: number, width: number, height: number): number {
  if (![count, width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw Error('Invalid batch dimensions or style count.');
  const bytes = estimateRetainedBytes(count, width, height);
  if (bytes > MAX_RETAINED_BYTES) throw Error(`This batch needs an estimated ${(bytes / 1024 / 1024).toFixed(1)} MiB for results, exceeding the 64 MiB budget. Narrow the parameter ranges or reduce the bead dimensions.`);
  return bytes;
}
export function validateImageSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw Error('Source image dimensions are invalid.');
  if (width * height > MAX_SOURCE_PIXELS) throw Error(`Source image exceeds the ${MAX_SOURCE_PIXELS / 1_000_000}-megapixel limit (${width.toLocaleString()} × ${height.toLocaleString()} pixels). Choose a smaller image or resize a copy before uploading. Automatic resizing is not available yet.`);
}
