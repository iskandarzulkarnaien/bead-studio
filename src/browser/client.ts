import type {WorkerRequest, WorkerEvent} from './model';
export class GeneratorClient {
  private worker: Worker | undefined;
  private id = '';
  start(request: WorkerRequest, onEvent: (event: WorkerEvent) => void) {
    this.cancel(); this.id = request.jobId;
    const worker = new Worker(new URL('./generation-worker.js', document.baseURI), {type: 'module'});
    this.worker = worker;
    worker.onmessage = ({data}: {data: WorkerEvent}) => {
      if (worker !== this.worker || data.jobId !== this.id) return;
      onEvent(data);
      if (['complete', 'export', 'error', 'inspected'].includes(data.type) && worker === this.worker) this.cancel();
    };
    worker.onerror = event => {
      if (worker !== this.worker) return;
      onEvent({type: 'error', jobId: request.jobId, error: {code: 'WORKER_FAILED', message: event.message || 'The generation worker stopped. Try a smaller image or batch.'}});
      this.cancel();
    };
    worker.onmessageerror = () => {
      onEvent({type: 'error', jobId: request.jobId, error: {code: 'WORKER_MESSAGE', message: 'The browser could not read the worker result.'}});
      this.cancel();
    };
    worker.postMessage(request);
  }
  cancel() { this.worker?.terminate(); this.worker = undefined; this.id = ''; }
}
