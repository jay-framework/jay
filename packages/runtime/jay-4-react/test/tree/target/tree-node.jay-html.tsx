import * as React from 'react';
import { ReactElement } from 'react';
import { HTMLElementProxy } from 'jay-runtime';
import {jay2React, Jay4ReactElementProps, mimicJayElement} from '../../../lib';
import { eventsFor } from '../../../lib';
import {Node} from "../source/tree-node";
import {TreeNode} from "./tree-node";

export interface TreeNodeViewState {
    headChar: string;
    node: Node;
    open: boolean;
}

export interface TreeNodeElementRefs {
    head: HTMLElementProxy<TreeNodeViewState, HTMLDivElement>;
}

export interface TreeNodeElementProps extends Jay4ReactElementProps<TreeNodeViewState> {}

const ReactTreeNode = jay2React(() => TreeNode);

export function render({
    vs,
    context,
}: TreeNodeElementProps): ReactElement<TreeNodeElementProps, any> {
    const {node, open, headChar} = vs;
    return (
        <div>
            <div role={`head-${node.id}`} {...eventsFor(context, 'head')}>
                <span className="tree-arrow">{headChar}</span>
                <span>{node.name}</span>
            </div>
            {open && (<ul>
                {node.children.map(child => (<li key={child.id}>
                    <ReactTreeNode {...child}/>
                </li>))}
            </ul>)}
        </div>)
}

export const render2 = mimicJayElement(render)
