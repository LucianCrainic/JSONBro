/**
 * The contract between the panel and the document worker.
 *
 * Imported by both bundles, so it must stay free of any DOM or node API.
 */
import type { Diagnostic } from '../webview/engine/diagnostics';

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
          lines: {
              starts: Uint32Array;
              depths: Uint16Array;
              foldEnds: Uint32Array;
              count: number;
          };
          diagnostics: Diagnostic[];
          /** Length of the *source*, for reporting size. */
          sourceLength: number;
      }
    | { id: number; command: 'failed'; message: string };
