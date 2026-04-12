import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface CounterViewState {
    count: number;
}

export function renderToStream(vs: CounterViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<button');
    w(' jay-coordinate="S0/0/0">');
    w('-');
    w('</button>');
    w('<span');
    w(' style="margin: 0 16px"');
    w(' jay-coordinate="S0/0/1">');
    w(escapeHtml(String(vs.count)));
    w('</span>');
    w('<button');
    w(' jay-coordinate="S0/0/2">');
    w('+');
    w('</button>');
    w('</div>');
}
