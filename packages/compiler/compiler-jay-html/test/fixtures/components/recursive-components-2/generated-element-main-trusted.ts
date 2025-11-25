import {
    JayElement,
    element as e,
    dynamicText as dt,
    RenderElement,
    ReferencesManager,
    dynamicElement as de,
    forEach,
    ConstructContext,
    childComp,
    RenderElementOptions,
    JayContract,
} from '@jay-framework/runtime';
import { treeNode, Node } from './tree-node';

export interface RecursiveComponents2ViewState {
    headChar: string;
    node: Node;
}

export interface RecursiveComponents2ElementRefs {}

export type RecursiveComponents2SlowViewState = {};
export type RecursiveComponents2FastViewState = {};
export type RecursiveComponents2InteractiveViewState = RecursiveComponents2ViewState;

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
export type RecursiveComponents2Contract = JayContract<
    RecursiveComponents2ViewState,
    RecursiveComponents2ElementRefs,
    RecursiveComponents2SlowViewState,
    RecursiveComponents2FastViewState,
    RecursiveComponents2InteractiveViewState
>;

export function render(options?: RenderElementOptions): RecursiveComponents2ElementPreRender {
    const [childrenRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [nodeRefManager, []] = ReferencesManager.for(options, [], [], [], [], {
        children: childrenRefManager,
    });
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        node: nodeRefManager,
    });
    const render = (viewState: RecursiveComponents2ViewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            e('div', {}, [
                e('div', {}, [dt((vs) => vs.headChar)]),
                e('div', {}, [dt((vs) => vs.node?.name)]),
                de('ul', {}, [
                    forEach(
                        (vs: RecursiveComponents2ViewState) => vs.node?.children,
                        (vs1: Node) => {
                            return e('li', {}, [childComp(treeNode, (vs1: Node) => vs1, refAR1())]);
                        },
                        'id',
                    ),
                ]),
            ]),
        ) as RecursiveComponents2Element;
    return [refManager.getPublicAPI() as RecursiveComponents2ElementRefs, render];
}
