import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface PageWithForwardedRefViewState {
    pageTitle: string;
}

export function renderToStream(vs: PageWithForwardedRefViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.pageTitle)));
    w('</h1>');
    w('<div');
    w(' class="card"');
    w(' jay-coordinate="S1/0">');
    w('<h3');
    w(' jay-coordinate="S1/0/0">');
    w(escapeHtml(String('Sign up')));
    w('</h3>');
    w('<jay:Counter');
    w(' initialValue="0"');
    w(' jay-coordinate="S1/0/1">');
    w('</jay:Counter>');
    w('</div>');
    w('</div>');
}
