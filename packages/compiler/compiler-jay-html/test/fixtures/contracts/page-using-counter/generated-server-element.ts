import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

enum IsPositive {
    positive,
    negative,
}

export interface PageUsingCounterViewState {
    counter?: CounterViewState;
}

export function renderToStream(vs: PageUsingCounterViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<div');
    w(' jay-coordinate="1">');
    w(escapeHtml(String(`value: ${vs.counter?.count}`)));
    w('</div>');
    w('<button');
    w(' jay-coordinate="counterAdd">');
    w('add');
    w('</button>');
    w('<button');
    w(' jay-coordinate="counterSubtract">');
    w('subtract');
    w('</button>');
    w('<div');
    w(' jay-coordinate="2">');
    if (vs.counter?.isPositive === IsPositive.positive) {
        w('<img');
        w(' src="positive.jpg"');
        w(' alt="positive"');
        w(' jay-coordinate="3">');
    }
    if (vs.counter?.isPositive === IsPositive.negative) {
        w('<img');
        w(' src="negative.jpg"');
        w(' alt="negative"');
        w(' jay-coordinate="4">');
    }
    w('</div>');
    w('</div>');
}