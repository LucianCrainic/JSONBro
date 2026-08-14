/**
 * The contract between the panel and the document worker.
 *
 * Imported by both bundles, so it must stay free of any DOM or node API.
 */
import type { Diagnostic } from '../webview/engine/diagnostics';
import type { SerializedLines } from '../webview/engine/line-index';

/** Work the panel asks the worker to do. */
export type PanelToWorker =
    | { id: number; command: 'formatText'; text: string; indent: number }
    /** Reads the document from a URL the host has made available. */
    | { id: number; command: 'formatUrl'; url: string; indent: number };

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
