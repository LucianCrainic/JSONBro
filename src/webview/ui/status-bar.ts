/**
 * The strip along the bottom of the panel.
 *
 * Views describe what they want shown; this module owns the rendering. It is
 * the only passive feedback surface in the UI, so it is where document facts
 * (validity, size, change counts) belong.
 */
import { byId, escapeHtml } from './dom';
import { Icons, type IconName } from './icons';

export type Tone = 'default' | 'ok' | 'warn' | 'error' | 'added' | 'removed' | 'modified';

export interface StatusSegment {
    text: string;
    icon?: IconName;
    tone?: Tone;
    title?: string;
}

export interface StatusModel {
    left?: StatusSegment[];
    right?: StatusSegment[];
}

export class StatusBar {
    private readonly leftEl: HTMLElement | null;
    private readonly rightEl: HTMLElement | null;

    constructor() {
        this.leftEl = byId('status-left');
        this.rightEl = byId('status-right');
    }

    public render(model: StatusModel): void {
        this.fill(this.leftEl, model.left ?? []);
        this.fill(this.rightEl, model.right ?? []);
    }

    public clear(): void {
        this.render({});
    }

    private fill(target: HTMLElement | null, segments: StatusSegment[]): void {
        if (target) {
            target.innerHTML = segments.map(segment => renderSegment(segment)).join('');
        }
    }
}

function renderSegment(segment: StatusSegment): string {
    const tone = segment.tone && segment.tone !== 'default' ? ` status__item--${segment.tone}` : '';
    const title = segment.title ? ` title="${escapeHtml(segment.title)}"` : '';
    const icon = segment.icon
        ? `<span class="codicon codicon-${segment.icon}" aria-hidden="true"></span>`
        : '';
    return `<span class="status__item${tone}"${title}>${icon}${escapeHtml(segment.text)}</span>`;
}

/** Human-readable byte size, e.g. "1.4 KB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Thousands-separated count with a singular/plural noun. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;
}

export { Icons };
