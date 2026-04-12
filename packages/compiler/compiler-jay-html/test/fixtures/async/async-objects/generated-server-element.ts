import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface O1OfAsyncObjectsViewState {
    s2: string;
    n2: number;
}

export interface Po1OfAsyncObjectsViewState {
    ps2: string;
    pn2: number;
}

export interface AsyncObjectsViewState {
    o1: O1OfAsyncObjectsViewState;
    po1: Promise<Po1OfAsyncObjectsViewState>;
}

export function renderToStream(vs: AsyncObjectsViewState, ctx: ServerRenderContext): void {
    const { write: w, onAsync } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<span');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.o1?.s2)));
    w('</span>');
    w('<span');
    w(' jay-coordinate="S0/0/1">');
    w(escapeHtml(String(vs.o1?.n2)));
    w('</span>');
    w('<div jay-async="po1:pending">');
    w('<div');
    w('>');
    w('still loading the object');
    w('</div>');
    w('</div>');
    onAsync(vs.po1, 'po1', {
        resolved: (vs1) =>
            '<div' +
            ' jay-coordinate="S0/0/3">' +
            '<span' +
            ' jay-coordinate="S0/0/3/0">' +
            escapeHtml(String(vs1.ps2)) +
            '</span>' +
            '<span' +
            ' jay-coordinate="S0/0/3/1">' +
            escapeHtml(String(vs1.pn2)) +
            '</span>' +
            '</div>',
    });
    w('</div>');
}
