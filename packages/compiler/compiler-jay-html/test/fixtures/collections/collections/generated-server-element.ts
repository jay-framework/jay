import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface ThingOfCollectionsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<ThingOfCollectionsViewState>;
}

export function renderToStream(vs: CollectionsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<div');
    w(' jay-coordinate="S0/0/1">');
    for (const vs1 of vs.things) {
        w('<div');
        w(' jay-coordinate="S0/0/1/0">');
        w('<span');
        w(' style="color:green; width: 100px; display: inline-block;"');
        w(' jay-coordinate="S1/0">');
        w(escapeHtml(String(vs1.name)));
        w('</span>');
        w('<span');
        w(' style="color:red; width: 100px; display: inline-block;"');
        w(' jay-coordinate="S1/1">');
        w(escapeHtml(String(vs1.completed)));
        w('</span>');
        w('<span');
        w(' style="color:blue; width: 100px; display: inline-block;"');
        w(' jay-coordinate="S1/2">');
        w(escapeHtml(String(vs1.cost)));
        w('</span>');
        w('</div>');
    }
    w('</div>');
    w('</div>');
}
