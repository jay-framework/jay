import {
    JayElement,
    HTMLElementCollectionProxy,
    HTMLElementProxy,
    RenderElementOptions,
    RenderElement,
} from '@jay-framework/runtime';
import { elementBridge, SecureReferencesManager } from '../../../../lib';
import {
    sandboxElement as e,
    sandboxForEach as forEach,
} from '../../../../lib/sandbox/sandbox-element';

export interface Item {
    id: string;
    text: string;
}

export interface CompViewState {
    text: string;
    items: Array<Item>;
}

export interface CompElementRefs {
    result: HTMLElementProxy<CompViewState, HTMLDivElement>;
    buttonExecGlobal: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    buttonExecElement: HTMLElementProxy<CompViewState, HTMLButtonElement>;
    itemButtonExecElement: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export type CompElement = JayElement<CompViewState, CompElementRefs>;
export type CompElementRender = RenderElement<CompViewState, CompElementRefs, CompElement>;
export type CompElementPreRender = [refs: CompElementRefs, CompElementRender];

export function render(options?: RenderElementOptions): CompElementPreRender {
    const [refManager, [result, buttonExecGlobal, buttonExecElement, itemButtonExecElement]] =
        SecureReferencesManager.forElement(
            ['result', 'buttonExecGlobal', 'buttonExecElement'],
            ['itemButtonExecElement'],
            [],
            [],
        );
    const render = (viewState: CompViewState) =>
        elementBridge(viewState, refManager, () => {
            return [
                e(result()),
                e(buttonExecGlobal()),
                e(buttonExecElement()),
                forEach(
                    (viewState: CompViewState) => viewState.items,
                    'id',
                    () => [e(itemButtonExecElement())],
                ),
            ];
        }) as unknown as CompElement;
    return [refManager.getPublicAPI() as CompElementRefs, render];
}
