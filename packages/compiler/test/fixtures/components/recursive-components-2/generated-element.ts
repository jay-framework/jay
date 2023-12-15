import {
    JayElement,
    element as e,
    dynamicText as dt,
    dynamicAttribute as da,
    dynamicElement as de,
    forEach,
    ConstructContext,
    RenderElementOptions,
} from 'jay-runtime';
import { treeNode, Node } from './tree-node?jay-mainSandbox';

export interface RecursiveComponents2ViewState {
    headChar: string;
    node: Node;
}

export interface RecursiveComponents2ElementRefs {}

export type RecursiveComponents2Element = JayElement<
    RecursiveComponents2ViewState,
    RecursiveComponents2ElementRefs
>;

export function render(
    viewState: RecursiveComponents2ViewState,
    options?: RenderElementOptions,
): RecursiveComponents2Element {
    return ConstructContext.withRootContext(
        viewState,
        () =>
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
        options,
    );
}
