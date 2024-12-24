import {HTMLElementCollectionProxy} from "jay-runtime";
import {Jay4ReactElementProps, eventsFor} from 'jay-4-react';
import { ReactElement } from 'react';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<Item>;
}

export interface CollectionWithRefsElementRefs {
    name: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    done: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export interface CollectionWithRefsElementProps extends Jay4ReactElementProps<CollectionWithRefsViewState> {}

export function render({
    vs,
    context,
}: CollectionWithRefsElementProps): ReactElement<CollectionWithRefsElementProps, any> {
    return <div>
        <h1>{vs.title}</h1>
        <div>
            {vs.items.map((vs1: Item) => {
                const cx1 = context.child(vs1.id, vs1);
                return (<div key={vs1.id}>
                    <span {...eventsFor(cx1, 'name')} style={{color: "green", width: "100px", display: "inline-block"}}>{vs1.name}</span>
                    <span {...eventsFor(cx1, 'completed')} style={{color: "red", width: "100px", display: "inline-block"}}>{vs1.completed}</span>
                    <span {...eventsFor(cx1, 'cost')} style={{color: "blue", width: "100px", display: "inline-block"}}>{vs1.cost}</span>
                    <button {...eventsFor(cx1, 'done')} style={{border:"1px blue", background: "darkblue", color: "white", display: "inline-block"}}
                            >done
                    </button>
                </div>)})}
        </div>
    </div>;
}
