import {JayElement, RenderElement, HTMLElementCollectionProxy, RenderElementOptions, JayContract} from "@jay-framework/runtime";

export interface SubItemOfItemOfJCompWithNestedRefsIssueViewState {
  id: string,
  subTitle: string
}

export interface ItemOfJCompWithNestedRefsIssueViewState {
  id: string,
  title: string,
  subItems: Array<SubItemOfItemOfJCompWithNestedRefsIssueViewState>
}

export interface JCompWithNestedRefsIssueViewState {
  items: Array<ItemOfJCompWithNestedRefsIssueViewState>
}


export interface JCompWithNestedRefsIssueElementRefs {
  items: {
    subItems: {
      nestedRef: HTMLElementCollectionProxy<SubItemOfItemOfJCompWithNestedRefsIssueViewState, HTMLDivElement>
    }
  }
}

export type JCompWithNestedRefsIssueElement = JayElement<JCompWithNestedRefsIssueViewState, JCompWithNestedRefsIssueElementRefs>
export type JCompWithNestedRefsIssueElementRender = RenderElement<JCompWithNestedRefsIssueViewState, JCompWithNestedRefsIssueElementRefs, JCompWithNestedRefsIssueElement>
export type JCompWithNestedRefsIssueElementPreRender = [JCompWithNestedRefsIssueElementRefs, JCompWithNestedRefsIssueElementRender]
export type JCompWithNestedRefsIssueContract = JayContract<JCompWithNestedRefsIssueViewState, JCompWithNestedRefsIssueElementRefs>;


export declare function render(options?: RenderElementOptions): JCompWithNestedRefsIssueElementPreRender