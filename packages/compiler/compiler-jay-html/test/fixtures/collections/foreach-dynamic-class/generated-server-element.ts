import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface ItemOfForeachDynamicClassViewState {
    name: string;
    isActive: boolean;
    id: string;
}

export interface ForeachDynamicClassViewState {
    items: Array<ItemOfForeachDynamicClassViewState>;
}

export function renderToStream(vs: ForeachDynamicClassViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    for (const vs1 of vs.items) {
        w('<div');
        w(' class="' + escapeAttr(String(`item ${vs1.isActive ? 'active' : ''}`)) + '"');
        w(' jay-coordinate="S0/0/0">');
        w('<span');
        w(' jay-coordinate="S1/0">');
        w(escapeHtml(String(vs1.name)));
        w('</span>');
        w('</div>');
    }
    w('</div>');
}
