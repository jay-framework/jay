import { escapeHtml, escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface DynamicAttrWithChildRefViewState {
    isSelected: boolean;
    label: string;
}

export function renderToStream(
    vs: DynamicAttrWithChildRefViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<label');
    w(' class="' + escapeAttr(String(`${vs.isSelected ? 'selected' : ''}`)) + '"');
    w(' jay-coordinate="S0/0">');
    w('<input');
    w(' type="checkbox"');
    w(' jay-coordinate="S0/0/0" />');
    w(escapeHtml(String(` ${vs.label} `)));
    w('</label>');
}
