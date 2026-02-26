import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

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
    w(' jay-coordinate="0">');
    w('<h1');
    w(' jay-coordinate="1">');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<div');
    w(' jay-coordinate="2">');
    for (const vs1 of vs.things) {
        w('<div');
        w(' jay-coordinate="' + escapeAttr(String(vs1.id)) + '">');
        w('<span');
        w(' style="color:green; width: 100px; display: inline-block;"');
        w(' jay-coordinate="' + escapeAttr(String(vs1.id)) + '/0">');
        w(escapeHtml(String(vs1.name)));
        w('</span>');
        w('<span');
        w(' style="color:red; width: 100px; display: inline-block;"');
        w(' jay-coordinate="' + escapeAttr(String(vs1.id)) + '/1">');
        w(escapeHtml(String(vs1.completed)));
        w('</span>');
        w('<span');
        w(' style="color:blue; width: 100px; display: inline-block;"');
        w(' jay-coordinate="' + escapeAttr(String(vs1.id)) + '/2">');
        w(escapeHtml(String(vs1.cost)));
        w('</span>');
        w('</div>');
    }
    w('</div>');
    w('</div>');
}
