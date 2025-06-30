import { HTMLElementCollectionProxy } from '@jay-framework/runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from '@jay-framework/4-react';

export interface ItemOfCollectionWithRefsViewState {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface GroupItemOfGroupOfCollectionWithRefsViewState {
    itemId: string;
    item: string;
}

export interface GroupOfCollectionWithRefsViewState {
    groupId: string;
    groupItems: Array<GroupItemOfGroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsViewState {
    title: string;
    items: Array<ItemOfCollectionWithRefsViewState>;
    groups: Array<GroupOfCollectionWithRefsViewState>;
}

export interface CollectionWithRefsElementRefs {
    items: {
        name: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        completed: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        cost: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLSpanElement>;
        done: HTMLElementCollectionProxy<ItemOfCollectionWithRefsViewState, HTMLButtonElement>;
    };
    groups: {
        groupItems: {
            item: HTMLElementCollectionProxy<
                GroupItemOfGroupOfCollectionWithRefsViewState,
                HTMLDivElement
            >;
        };
    };
}

export interface CollectionWithRefsElementProps
    extends Jay4ReactElementProps<CollectionWithRefsViewState> {}

export function reactRender({
    vs,
    context,
}: CollectionWithRefsElementProps): ReactElement<CollectionWithRefsElementProps, any> {
    return (
        <div>
            <h1>{vs.title}</h1>
            <div>
                {vs.items.map((vs1: ItemOfCollectionWithRefsViewState) => {
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
                {vs.groups.map((vs1: GroupOfCollectionWithRefsViewState) => {
                    const cx1 = context.child(vs1.groupId, vs1);
                    return (
                        <div key={vs1.groupId}>
                            {vs1.groupItems.map(
                                (vs2: GroupItemOfGroupOfCollectionWithRefsViewState) => {
                                    const cx2 = cx1.child(vs2.itemId, vs2);
                                    return (
                                        <div key={vs2.itemId}>
                                            <div {...eventsFor(cx2, 'item')}>{vs2.item}</div>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
