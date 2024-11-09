import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { treeNode, Node } from './tree-node';

export interface RecursiveComponents2ViewState {
    headChar: string;
    node: Node;
}

export interface RecursiveComponents2ElementRefs {}

export type RecursiveComponents2Element = JayElement<
    RecursiveComponents2ViewState,
    RecursiveComponents2ElementRefs
>;
export type RecursiveComponents2ElementRender = RenderElement<
    RecursiveComponents2ViewState,
    RecursiveComponents2ElementRefs,
    RecursiveComponents2Element
>;
export type RecursiveComponents2ElementPreRender = [
    RecursiveComponents2ElementRefs,
    RecursiveComponents2ElementRender,
];

export function render(options?: RenderElementOptions): RecursiveComponents2ElementPreRender {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState: RecursiveComponents2ViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.headChar)]),
                e('div', {}, [dt((vs) => vs.node?.name)]),
                de('ul', {}, [
                    forEach(
                        (vs) => vs.node?.children,
                        (vs1: Node) => {
                            return e('li', {}, [e('TreeNode', { props: da((vs) => vs) }, [])]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as RecursiveComponents2Element;
    return [refManager.getPublicAPI() as RecursiveComponents2ElementRefs, render];
}
