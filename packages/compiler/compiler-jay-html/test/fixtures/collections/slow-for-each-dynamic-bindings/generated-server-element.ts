import {escapeHtml, escapeAttr, type ServerRenderContext} from "@jay-framework/ssr-runtime";

export interface CategoryOfSlowForEachDynamicBindingsViewState {
    categoryId: string;
    categoryName: string;
    isSelected: boolean;
}

export interface SlowForEachDynamicBindingsViewState {
    categories: Array<CategoryOfSlowForEachDynamicBindingsViewState>;
}

export function renderToStream(vs: SlowForEachDynamicBindingsViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' class="filter-categories"');
    w(' jay-coordinate="S0/0">');
    for (const vs1 of vs.categories) {
        w('<label');
        w(' class="' + escapeAttr(String(`chip ${vs1.isSelected ? 'selected' : ''}`)) + '"');
        w(' jay-coordinate="S0/0/0">');
        w('<input');
        w(' type="checkbox"');
        w(' jay-coordinate="S1/0" />');
        w(escapeHtml(String(` ${vs1.categoryName}`)));
        w('</label>');
    }
    w('</div>');
}
