import { escapeHtml, type ServerRenderContext } from '@jay-framework/ssr-runtime';

export interface SizesExtraDatumOfExtendedFieldOfPOfForeachNestedOptionalViewState {
    label: string;
    id: string;
}

export interface ExtendedFieldOfPOfForeachNestedOptionalViewState {
    sizesExtraData: Array<SizesExtraDatumOfExtendedFieldOfPOfForeachNestedOptionalViewState>;
}

export interface POfForeachNestedOptionalViewState {
    extendedFields: ExtendedFieldOfPOfForeachNestedOptionalViewState;
}

export interface ForeachNestedOptionalViewState {
    title: string;
    p: POfForeachNestedOptionalViewState;
}

export function renderToStream(vs: ForeachNestedOptionalViewState, ctx: ServerRenderContext): void {
    const { write: w } = ctx;
    w('<div');
    w(' jay-coordinate="S0/0">');
    w('<h1');
    w(' jay-coordinate="S0/0/0">');
    w(escapeHtml(String(vs.title)));
    w('</h1>');
    w('<ul');
    w(' jay-coordinate="S0/0/1">');
    for (const vs1 of vs.p?.extendedFields?.sizesExtraData ?? []) {
        w('<li');
        w(' jay-coordinate="S0/0/1/0">');
        w(escapeHtml(String(vs1.label)));
        w('</li>');
    }
    w('</ul>');
    w('</div>');
}
