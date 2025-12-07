import {
    TreeViewState,
    TreeRefs as TreeElementRefs,
    TreeSlowViewState,
    TreeFastViewState,
    TreeInteractiveViewState,
    TreeContract,
} from './tree.jay-contract';

import { JayElement, RenderElement, RenderElementOptions } from '@jay-framework/runtime';

// Re-export contract types for convenience
export {
    TreeViewState,
    TreeElementRefs,
    TreeSlowViewState,
    TreeFastViewState,
    TreeInteractiveViewState,
    TreeContract,
};

export type TreeElement = JayElement<TreeViewState, TreeElementRefs>;
export type TreeElementRender = RenderElement<TreeViewState, TreeElementRefs, TreeElement>;
export type TreeElementPreRender = [TreeElementRefs, TreeElementRender];

export declare function render(options?: RenderElementOptions): TreeElementPreRender;

