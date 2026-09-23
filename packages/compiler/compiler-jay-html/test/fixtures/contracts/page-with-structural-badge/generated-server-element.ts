import {
    escapeHtml,
    escapeAttr,
    classNames as cx,
    type ServerRenderContext,
} from '@jay-framework/ssr-runtime';

import { BadgeViewState, Status } from './badge/badge.jay-contract';

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
    const vs_badge0_raw = (vs as any).__headlessInstances?.['S0/0/badge:AR0'] as any;
    const vs_badge0 = vs_badge0_raw
        ? ({
              ...vs_badge0_raw,
              status:
                  typeof (Status as any)[vs_badge0_raw.status] === 'number'
                      ? (Status as any)[vs_badge0_raw.status]
                      : Number(vs_badge0_raw.status),
              count: Number(vs_badge0_raw.count),
              featured: vs_badge0_raw.featured === true || vs_badge0_raw.featured === 'true',
          } as BadgeViewState)
        : undefined;
    if (vs_badge0) {
        w('<span');
        w(
            ' class="' +
                escapeAttr(
                    String(
                        cx(
                            'badge',
                            vs_badge0.status === Status.success ? 'badge--success' : '',
                            vs_badge0.status === Status.warning ? 'badge--warning' : '',
                            vs_badge0.status === Status.error ? 'badge--error' : '',
                        ),
                    ),
                ) +
                '"',
        );
        w(' jay-coordinate="S1/0">');
        if (vs_badge0.status === Status.success) {
            w('<span');
            w(' class="badge-icon badge-icon--success"');
            w(' jay-coordinate="S1/0/0">');
            w('[OK]');
            w('</span>');
        }
        if (vs_badge0.status === Status.warning) {
            w('<span');
            w(' class="badge-icon badge-icon--warning"');
            w(' jay-coordinate="S1/0/1">');
            w('[!]');
            w('</span>');
        }
        if (vs_badge0.status === Status.error) {
            w('<span');
            w(' class="badge-icon badge-icon--error"');
            w(' jay-coordinate="S1/0/2">');
            w('[X]');
            w('</span>');
        }
        w('<span');
        w(' class="badge-label"');
        w(' jay-coordinate="S1/0/3">');
        w(escapeHtml(String(vs_badge0.label)));
        w('</span>');
        w('<span');
        w(' class="badge-count"');
        w(' jay-coordinate="S1/0/4">');
        w(escapeHtml(String(`Count: ${vs_badge0.count}`)));
        w('</span>');
        if (vs_badge0.featured) {
            w('<span');
            w(' class="badge-star"');
            w(' jay-coordinate="S1/0/5">');
            w('FEATURED');
            w('</span>');
        }
        w('</span>');
    }
    w('</div>');
}
