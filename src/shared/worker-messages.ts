/**
 * The contract between the panel and the document worker.
 *
 * Imported by both bundles, so it must stay free of any DOM or node API.
 */
import type { Diagnostic } from '../webview/engine/diagnostics';
import type { SerializedLines } from '../webview/engine/line-index';

/**
 * Work the panel asks the worker to do.
 *
 * A file arrives as bytes rather than as a URL. The worker used to fetch it
 * itself, which cannot work: the worker is started from a blob: URL, and a
 * blob: worker is outside the scope of the service worker that serves webview
 * resources, so its request for one is never answered. The panel document is
 * inside that scope, so it does the reading and hands the bytes over a chunk at
 * a time -- transferred, not copied, so no more than one chunk is ever held on
 * the panel's thread.
 */
export type PanelToWorker =
    | { id: number; command: 'formatText'; text: string; indent: number }
    /** Opens a read; chunks follow until readEnd closes it. */
    | { id: number; command: 'readStart'; indent: number }
    | { id: number; command: 'readChunk'; bytes: ArrayBuffer }
    | { id: number; command: 'readEnd' };

/** What the worker sends back. */
export type WorkerToPanel =
    | { id: number; command: 'progress'; stage: 'reading' | 'formatting'; bytes: number }
    | {
          id: number;
          command: 'done';
          chunks: string[];
          /**
           * Restated from the index itself rather than spelled out here, so
           * adding a column cannot leave the two definitions disagreeing.
           */
          lines: SerializedLines;
          diagnostics: Diagnostic[];
          /** Length of the *source*, for reporting size. */
          sourceLength: number;
      }
    | { id: number; command: 'failed'; message: string };
