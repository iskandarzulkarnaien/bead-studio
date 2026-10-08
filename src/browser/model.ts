import type {Ranges, StyleSettings} from '../settings';
export interface Pattern {
  id: string; width: number; height: number; indices: Uint8Array;
  settings: StyleSettings; counts: Record<string, number>;
}
export interface ImageInput { file: File; name: string }
export interface SerializableError { code: string; message: string }
export type WorkerRequest =
  | {type: 'inspect'; jobId: string; file: Blob}
  | {type: 'generate'; jobId: string; file: Blob; settings: StyleSettings; ranges?: Ranges}
  | {type: 'export'; jobId: string; pattern: Pattern; cellSize: number; labels: boolean; gridDisplay: StyleSettings['gridDisplay']};
export type WorkerEvent =
  | {type: 'inspected'; jobId: string; width: number; height: number}
  | {type: 'progress'; jobId: string; completed: number; total: number; message: string}
  | {type: 'style'; jobId: string; item: Pattern; completed: number; total: number}
  | {type: 'complete'; jobId: string}
  | {type: 'export'; jobId: string; blob: Blob; filename: string}
  | {type: 'error'; jobId: string; error: SerializableError};
export interface PlatformApi {
  chooseImage(): Promise<ImageInput | null>;
  downloadFile(blob: Blob, filename: string): void;
  dispose(): void;
}
