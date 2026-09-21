import {
    escapeHtml,
    escapeAttr,
    classNames as cx,
    type ServerRenderContext,
} from '@jay-framework/ssr-runtime';

import { Status } from './badge/badge.jay-contract';

export interface PageWithStructuralBadgeViewState {
    pageTitle: string;
}

export function renderToStream(
    vs: PageWithStructuralBadgeViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    w('<span');
    w(
        ' class="' +
            escapeAttr(
                String(
                    cx(
                        'badge',
                        (Status.success as Status) === Status.success ? 'badge--success' : '',
                        (Status.success as Status) === Status.warning ? 'badge--warning' : '',
                        (Status.success as Status) === Status.error ? 'badge--error' : '',
                    ),
                ),
            ) +
            '"',
    );
    w(' jay-coordinate="S1/0">');
    if ((Status.success as Status) === Status.success) {
        w('<span');
        w(' class="badge-icon badge-icon--success"');
        w(' jay-coordinate="S1/0/0">');
        w('[OK]');
        w('</span>');
    }
    if ((Status.success as Status) === Status.warning) {
        w('<span');
        w(' class="badge-icon badge-icon--warning"');
        w(' jay-coordinate="S1/0/1">');
        w('[!]');
        w('</span>');
    }
    if ((Status.success as Status) === Status.error) {
        w('<span');
        w(' class="badge-icon badge-icon--error"');
        w(' jay-coordinate="S1/0/2">');
        w('[X]');
        w('</span>');
    }
    w('<span');
    w(' class="badge-label"');
    w(' jay-coordinate="S1/0/3">');
    w(escapeHtml(String('Live Status')));
    w('</span>');
    w('<span');
    w(' class="badge-count"');
    w(' jay-coordinate="S1/0/4">');
    w(escapeHtml(String(`Count: ${42}`)));
    w('</span>');
    if (true) {
        w('<span');
        w(' class="badge-star"');
        w(' jay-coordinate="S1/0/5">');
        w('FEATURED');
        w('</span>');
    }
    w('</span>');
    w('</div>');
}
