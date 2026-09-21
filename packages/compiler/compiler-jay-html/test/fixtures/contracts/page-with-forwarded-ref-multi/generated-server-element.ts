import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface CardOfPageWithForwardedRefMultiViewState {
    heading: string;
}

export interface PageWithForwardedRefMultiViewState {
    pageTitle: string;
    cards: Array<CardOfPageWithForwardedRefMultiViewState>;
}

export function renderToStream(
    vs: PageWithForwardedRefMultiViewState,
    ctx: ServerRenderContext,
): void {
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
    for (const vs1 of vs.cards) {
        w('<div');
        w(' class="cards"');
        w(' jay-coordinate="S0/0/1">');
        w('<div');
        w(' class="card"');
        w(' jay-coordinate="S3/0">');
        w('<h3');
        w(' jay-coordinate="S3/0/0">');
        w(escapeHtml(String(vs1.heading)));
        w('</h3>');
        w('<jay:Counter');
        w(' initialValue="0"');
        w(' jay-coordinate="S3/0/1">');
        w('</jay:Counter>');
        w('</div>');
        w('</div>');
    }
    w('</div>');
}
