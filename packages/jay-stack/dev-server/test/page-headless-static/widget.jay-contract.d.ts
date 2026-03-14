import {
    JayContract,
    JayElement,
    RenderElement,
    RenderElementOptions,
} from '@jay-framework/runtime';

export interface WidgetProps {
    itemId: string;
}

export interface WidgetViewState {
    label: string;
    value: number;
}

export interface WidgetRefs {}

export interface WidgetRepeatedRefs {}

export type WidgetSlowViewState = Pick<WidgetViewState, 'label'>;
export type WidgetFastViewState = Pick<WidgetViewState, 'value'>;
export type WidgetInteractiveViewState = Pick<WidgetViewState, 'value'>;

export type WidgetElement = JayElement<WidgetViewState, WidgetRefs>;
export type WidgetElementRender = RenderElement<WidgetViewState, WidgetRefs, WidgetElement>;
export type WidgetElementPreRender = [WidgetRefs, WidgetElementRender];
export type WidgetContract = JayContract<
    WidgetViewState,
    WidgetRefs,
    WidgetSlowViewState,
    WidgetFastViewState,
    WidgetInteractiveViewState
>;

export declare function render(options?: RenderElementOptions): WidgetElementPreRender;
