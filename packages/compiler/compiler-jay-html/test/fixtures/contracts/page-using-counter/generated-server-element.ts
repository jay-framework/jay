import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

import { CounterViewState, IsPositive } from '../counter/counter.jay-contract';

export interface PageUsingCounterViewState {
    counter?: CounterViewState;
}

export function renderToStream(vs: PageUsingCounterViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="0">');
    w('<div');
    w(' jay-coordinate="0/0">');
    w(escapeHtml(String(`value: ${vs.counter?.count}`)));
    w('</div>');
    w('<button');
    w(' jay-coordinate="0/1">');
    w('add');
    w('</button>');
    w('<button');
    w(' jay-coordinate="0/2">');
    w('subtract');
    w('</button>');
    w('<div');
    w(' jay-coordinate="0/3">');
      if (vs.counter?.isPositive === IsPositive.positive) {
          w('<img');
          w(' src="positive.jpg"');
          w(' alt="positive"');
          w(' jay-coordinate="0/3/0">');
      }
      if (vs.counter?.isPositive === IsPositive.negative) {
          w('<img');
          w(' src="negative.jpg"');
          w(' alt="negative"');
          w(' jay-coordinate="0/3/1">');
      }
    w('</div>');
    w('</div>');
}
