import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface AsyncSimpleTypesViewState {
    s1: string;
    p1: Promise<string>;
}

export function renderToStream(vs: AsyncSimpleTypesViewState, ctx: ServerRenderContext): void {
    const { write: w, onAsync } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<span');
    w(' jay-coordinate="0/0">');
    w(escapeHtml(String(vs.s1)));
    w('</span>');
    w('<div jay-async="p1:pending">');
    w('<span');
    w('>');
    w('Still loading');
    w('</span>');
    w('</div>');
    onAsync(vs.p1, 'p1', {
        resolved: (vs1) => '<span' + ' jay-coordinate="0/1">' + escapeHtml(String(vs1)) + '</span>',
        rejected: (vs1) =>
            '<span' +
            ' jay-coordinate="0/3">' +
            escapeHtml(String(`We have an error: ${vs1.name}, ${vs1.message}, ${vs1.stack}`)) +
            '</span>',
    });
    w('</div>');
}
