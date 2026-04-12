import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export function renderToStream(vs: ConditionsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    if (vs.cond) {
        w('<div');
        w(' style="color:red"');
        w(' jay-coordinate="S0/0/0">');
        w(escapeHtml(String(vs.text1)));
        w('</div>');
    }
    if (!vs.cond) {
        w('<div');
        w(' style="color:green"');
        w(' jay-coordinate="S0/0/1">');
        w(escapeHtml(String(vs.text2)));
        w('</div>');
    }
    w('</div>');
}
