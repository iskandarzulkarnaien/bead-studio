/// <reference lib="webworker" />
import {adjust, gridSize, sample, type Pixels} from '../image-core';
import {palette, quantize} from '../color';
import {batchCount, iterateBatch, validateStyle} from '../settings';
import {decodeImage} from './decode';
import {validateBatchBudget} from './limits';
import {exportPattern} from './render';
import type {Pattern, WorkerRequest, WorkerEvent} from './model';
const worker = self as unknown as DedicatedWorkerGlobalScope;
const codeIndex = new Map(palette.map((color, i) => [color.code, i]));
function send(event: WorkerEvent, transfer: Transferable[] = []) { worker.postMessage(event, transfer); }
worker.onmessage = async ({data}: {data: WorkerRequest}) => {
  const jobId = data.jobId;
  try {
    if (typeof jobId !== 'string' || jobId.length > 80) throw Error('Invalid job identifier.');
    if (data.type === 'export') {
      const result = await exportPattern(data.pattern, data.cellSize, data.labels, data.gridDisplay);
      send({type: 'export', jobId, ...result}); return;
    }
    if (data.type !== 'inspect' && data.type !== 'generate') throw Error('Unknown worker request.');
    send({type: 'progress', jobId, completed: 0, total: 1, message: 'Reading image…'});
    const source = await decodeImage(data.file);
    if (data.type === 'inspect') { send({type: 'inspected', jobId, width: source.width, height: source.height}); return; }
    const settings = validateStyle(data.settings), total = data.ranges ? batchCount(data.ranges) : 1;
    const [width, height] = gridSize(source.width, source.height, settings.maxWidth, settings.maxHeight);
    validateBatchBudget(total, width, height);
    const plans = data.ranges ? iterateBatch(settings, data.ranges) : [settings];
    let completed = 0, previousAdjustments = '', adjusted: Pixels = source;
    for (const style of plans) {
      const key = [style.pre_blur, style.sharpen, style.gamma, style.contrast, style.saturation].join(',');
      if (key !== previousAdjustments) { adjusted = await adjust(source, style); previousAdjustments = key; }
      const codes = quantize(sample(adjusted, width, height, style), width, height, style);
      const indices = new Uint8Array(width * height), counts: Record<string, number> = {};
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const code = codes[y][x]; indices[y * width + x] = codeIndex.get(code)!; counts[code] = (counts[code] ?? 0) + 1;
      }
      const item: Pattern = {id: `${jobId}-${++completed}`, width, height, indices, settings: style, counts};
      send({type: 'style', jobId, item, completed, total}, [indices.buffer]);
    }
    send({type: 'complete', jobId});
  } catch (e) {
    send({type: 'error', jobId, error: {code: 'GENERATION_FAILED', message: e instanceof Error ? e.message : String(e)}});
  }
};
