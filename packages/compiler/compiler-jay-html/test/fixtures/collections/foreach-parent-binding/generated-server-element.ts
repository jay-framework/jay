import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface ItemOfForeachParentBindingViewState {
    name: string;
    id: string;
}

export interface ForeachParentBindingViewState {
    listTitle: string;
    items: Array<ItemOfForeachParentBindingViewState>;
}

export function renderToStream(vs: ForeachParentBindingViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<ul');
    w(' jay-coordinate="S0/0">');
    for (const vs1 of vs.items) {
        w('<li');
        w(' data-group="' + escapeAttr(String(vs.listTitle)) + '"');
        w(' jay-coordinate="S0/0/0">');
        w('<span');
        w(' class="name"');
        w(' jay-coordinate="S1/0">');
        w(escapeHtml(String(vs1.name)));
        w('</span>');
        w('<span');
        w(' class="title"');
        w(' jay-coordinate="S1/1">');
        w(escapeHtml(String(vs.listTitle)));
        w('</span>');
        w('</li>');
    }
    w('</ul>');
}
