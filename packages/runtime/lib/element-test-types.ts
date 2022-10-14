import {BaseJayElement} from './element-types';

declare module './element-types' {
  export interface JayComponent<Props, ViewState, jayElement extends BaseJayElement<ViewState>> {
    element: jayElement
  }
}