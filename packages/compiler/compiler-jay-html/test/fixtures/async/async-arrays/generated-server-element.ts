import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface A1OfAsyncArraysViewState {
    s3: string;
    n3: number;
}

export interface Pa1OfAsyncArraysViewState {
    ps3: string;
    pn3: number;
}

export interface AsyncArraysViewState {
    a1: Array<A1OfAsyncArraysViewState>;
    pa1: Promise<Array<Pa1OfAsyncArraysViewState>>;
}

export function renderToStream(vs: AsyncArraysViewState, ctx: ServerRenderContext): void {
    const { write: w, onAsync } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    for (const vs1 of vs.a1) {
        w('<div');
        w(' jay-coordinate="S0/0/0">');
        w('<span');
        w(' jay-coordinate="S1/0">');
        w(escapeHtml(String(vs1.s3)));
        w('</span>');
        w('<span');
        w(' jay-coordinate="S1/1">');
        w(escapeHtml(String(vs1.n3)));
        w('</span>');
        w('</div>');
    }
    w('<div jay-async="pa1:pending">');
    w('<span');
    w('>');
    w('still loading');
    w('</span>');
    w('</div>');
    onAsync(vs.pa1, 'pa1', {
        resolved: (vs1) =>
            '<div' +
            ' jay-coordinate="S0/0/2">' +
            vs1
                .map(
                    (vs2) =>
                        '<div' +
                        ' jay-coordinate="S0/0/2/0">' +
                        '<span' +
                        ' jay-coordinate="S2/0">' +
                        escapeHtml(String(vs2.ps3)) +
                        '</span>' +
                        '<span' +
                        ' jay-coordinate="S2/1">' +
                        escapeHtml(String(vs2.pn3)) +
                        '</span>' +
                        '</div>',
                )
                .join('') +
            '</div>',
    });
    w('</div>');
}
