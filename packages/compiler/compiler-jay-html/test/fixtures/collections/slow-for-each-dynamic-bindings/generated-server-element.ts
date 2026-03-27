import { escapeAttr, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface CategoryOfSlowForEachDynamicBindingsViewState {
    categoryId: string;
    categoryName: string;
    isSelected: boolean;
}

export interface SlowForEachDynamicBindingsViewState {
    categories: Array<CategoryOfSlowForEachDynamicBindingsViewState>;
}

export function renderToStream(
    vs: SlowForEachDynamicBindingsViewState,
    ctx: ServerRenderContext,
): void {
    const { write: w } = ctx;
    w('<div');
    w(' class="filter-categories"');
    w(' jay-coordinate="0">');
    {
        const vs1 = vs.categories?.[0];
        if (vs1) {
            w('<label');
            w(' class="' + escapeAttr(String(`chip ${vs1.isSelected ? 'selected' : ''}`)) + '"');
            w(' jay-coordinate="cat1">');
            w('<input');
            w(' type="checkbox"');
            w(' jay-coordinate="cat1/0" />');
            w(' Category A ');
            w('</label>');
        }
    }
    {
        const vs1 = vs.categories?.[1];
        if (vs1) {
            w('<label');
            w(' class="' + escapeAttr(String(`chip ${vs1.isSelected ? 'selected' : ''}`)) + '"');
            w(' jay-coordinate="cat2">');
            w('<input');
            w(' type="checkbox"');
            w(' jay-coordinate="cat2/0" />');
            w(' Category B ');
            w('</label>');
        }
    }
    w('</div>');
}
