import './element-types';

declare module './element-types' {
    export interface BaseJayElement<ViewState> {
        dom: HTMLElement;
    }
}
