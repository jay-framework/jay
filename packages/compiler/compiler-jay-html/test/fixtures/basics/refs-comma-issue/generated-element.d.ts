import {
    JayElement,
    RenderElement,
    HTMLElementCollectionProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

export interface ContractPathOfRefsCommaIssueViewState {
    id: string;
}

export interface BindItemOfRefsCommaIssueViewState {
    id: string;
}

export interface RefsCommaIssueViewState {
    contractPath: Array<ContractPathOfRefsCommaIssueViewState>;
    bindItems: Array<BindItemOfRefsCommaIssueViewState>;
}

export interface RefsCommaIssueElementRefs {
    bindItems: {
        bli: HTMLElementCollectionProxy<BindItemOfRefsCommaIssueViewState, HTMLDivElement>;
    };
}

export type RefsCommaIssueElement = JayElement<RefsCommaIssueViewState, RefsCommaIssueElementRefs>;
export type RefsCommaIssueElementRender = RenderElement<
    RefsCommaIssueViewState,
    RefsCommaIssueElementRefs,
    RefsCommaIssueElement
>;
export type RefsCommaIssueElementPreRender = [
    RefsCommaIssueElementRefs,
    RefsCommaIssueElementRender,
];
export type RefsCommaIssueContract = JayContract<
    RefsCommaIssueViewState,
    RefsCommaIssueElementRefs
>;

export declare function render(options?: RenderElementOptions): RefsCommaIssueElementPreRender;
