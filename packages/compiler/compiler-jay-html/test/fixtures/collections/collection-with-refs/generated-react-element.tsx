import { HTMLElementCollectionProxy } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from 'jay-4-react';

export interface Item {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItem {
    itemId: string;
    item: string;
}

export interface Group {
    groupId: string;
    groupItems: Array<GroupItem>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<Item>;
    groups: Array<Group>;
}

export interface CollectionWithRefsElementRefs {
    name: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    completed: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    cost: HTMLElementCollectionProxy<Item, HTMLSpanElement>;
    done: HTMLElementCollectionProxy<Item, HTMLButtonElement>;
}

export interface CollectionWithRefsElementProps
    extends Jay4ReactElementProps<CollectionWithRefsViewState> {}

export function render({
    vs,
    context,
}: CollectionWithRefsElementProps): ReactElement<CollectionWithRefsElementProps, any> {
    return (
        <div>
            <h1>{vs.title}</h1>
            <div>
                {vs.items.map((vs1: Item) => {
                    const cx1 = context.child(vs1.id, vs1);
                    return (
                        <div key={vs1.id}>
                            <span
                                {...eventsFor(cx1, 'name')}
                                style={{ color: 'green', width: '100px', display: 'inline-block' }}
                            >
                                {vs1.name}
                            </span>
                            <span
                                {...eventsFor(cx1, 'completed')}
                                style={{ color: 'red', width: '100px', display: 'inline-block' }}
                            >
                                {vs1.completed}
                            </span>
                            <span
                                {...eventsFor(cx1, 'cost')}
                                style={{ color: 'blue', width: '100px', display: 'inline-block' }}
                            >
                                {vs1.cost}
                            </span>
                            <button
                                {...eventsFor(cx1, 'done')}
                                style={{
                                    border: '1px blue',
                                    background: 'darkblue',
                                    color: 'white',
                                    display: 'inline-block',
                                }}
                            >
                                done
                            </button>
                        </div>
                    );
                })}
                {vs.groups.map((vs1: Group) => {
                    const cx1 = context.child(vs1.groupId, vs1);
                    return (
                        <div key={vs1.groupId}>
                            {vs1.groupItems.map((vs2: GroupItem) => {
                                const cx2 = cx1.child(vs2.itemId, vs2);
                                return (
                                    <div key={vs2.itemId}>
                                        <div>{vs2.item}</div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const render2 = mimicJayElement(render);
