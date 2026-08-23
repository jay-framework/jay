import {
    JayElement,
    RenderElement,
    HTMLElementProxy,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';

import './page.css';

export interface AddMenuListRowOfPageViewState {
    rowKey: string;
    itemId: string;
    title: string;
    subCategory: string;
    rowClass: string;
}

export interface PageViewState {
    statusMessage: string;
    statusTone: string;
    showStatusMessage: boolean;
    catalogLoading: boolean;
    showNoCatalog: boolean;
    addMenuListRows: Array<AddMenuListRowOfPageViewState>;
    showAddMenuEditor: boolean;
    editorTitle: string;
    editorSubCategory: string;
    editorTokenValue: string;
    editorFontSize: string;
    editorFontWeight: string;
    editorFontFamily: string;
    showTypographyFields: boolean;
    showTokenValueField: boolean;
    editorReadOnly: boolean;
    editorReadOnlyReason: string;
    unsavedChangeCount: number;
    saveButtonLabel: string;
    saveDisabled: boolean;
    discardDisabled: boolean;
    showAnalysisSection: boolean;
    showReport: boolean;
    reportSummary: string;
    reportBody: string;
}

export interface PageElementRefs {
    saveCatalogBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    discardCatalogBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    regenerateCatalogBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    toggleAnalysisBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    catalogList: HTMLElementProxy<PageViewState, HTMLDivElement>;
    editorTitleInput: HTMLElementProxy<PageViewState, HTMLInputElement>;
    editorTokenValueInput: HTMLElementProxy<PageViewState, HTMLInputElement>;
    editorFontFamilyInput: HTMLElementProxy<PageViewState, HTMLInputElement>;
    editorFontSizeInput: HTMLElementProxy<PageViewState, HTMLInputElement>;
    editorFontWeightInput: HTMLElementProxy<PageViewState, HTMLInputElement>;
    previewHost: HTMLElementProxy<PageViewState, HTMLDivElement>;
    runAnalysisBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
    sendToAgentBtn: HTMLElementProxy<PageViewState, HTMLButtonElement>;
}

export type PageSlowViewState = {};
export type PageFastViewState = PageViewState;
export type PageInteractiveViewState = PageViewState;

export type PageElement = JayElement<PageViewState, PageElementRefs>;
export type PageElementRender = RenderElement<PageViewState, PageElementRefs, PageElement>;
export type PageElementPreRender = [PageElementRefs, PageElementRender];
export type PageContract = JayContract<
    PageViewState,
    PageElementRefs,
    PageSlowViewState,
    PageFastViewState,
    PageInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): PageElementPreRender;
