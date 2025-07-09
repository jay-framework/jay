import { HTMLElementCollectionProxy } from '@jay-framework/runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from '@jay-framework/4-react';

export enum ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState {
    state1,
    state2,
}

export interface SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    subTitle: string;
}

export interface ItemOfNestedCollectionWithRefsInVariantsViewState {
    id: string;
    itemState: ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState;
    title: string;
    subItems: Array<SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsViewState {
    items: Array<ItemOfNestedCollectionWithRefsInVariantsViewState>;
}

export interface NestedCollectionWithRefsInVariantsElementRefs {
    items: {
        subItems: {
            nestedRef: HTMLElementCollectionProxy<
                SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                HTMLDivElement
            >;
        };
    };
}

export interface NestedCollectionWithRefsInVariantsElementProps
    extends Jay4ReactElementProps<NestedCollectionWithRefsInVariantsViewState> {}

export function reactRender({
    vs,
    context,
}: NestedCollectionWithRefsInVariantsElementProps): ReactElement<
    NestedCollectionWithRefsInVariantsElementProps,
    any
> {
    return (
        <div>
            {vs.items.map((vs1: ItemOfNestedCollectionWithRefsInVariantsViewState) => {
                const cx1 = context.child(vs1.id, vs1);
                return (
                    <div key={vs1.id}>
                        <div>
                            {vs1.itemState ===
                                ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState.state1 && (
                                <div>
                                    <div>
                                        <div>
                                            <div>{vs1.title}</div>
                                            <div>
                                                {vs1.subItems.map(
                                                    (
                                                        vs2: SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                                                    ) => {
                                                        const cx2 = cx1.child(vs2.id, vs2);
                                                        return (
                                                            <div key={vs2.id}>
                                                                <div>
                                                                    <div>{vs2.subTitle}</div>
                                                                    <div
                                                                        {...eventsFor(
                                                                            cx2,
                                                                            'nestedRef',
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {vs1.itemState ===
                                ItemStateOfItemOfNestedCollectionWithRefsInVariantsViewState.state2 && (
                                <div>
                                    <div>
                                        <div>
                                            <div>{vs1.title}</div>
                                            <div>
                                                {vs1.subItems.map(
                                                    (
                                                        vs2: SubItemOfItemOfNestedCollectionWithRefsInVariantsViewState,
                                                    ) => {
                                                        const cx2 = cx1.child(vs2.id, vs2);
                                                        return (
                                                            <div key={vs2.id}>
                                                                <div>
                                                                    <div>{vs2.subTitle}</div>
                                                                    <div
                                                                        {...eventsFor(
                                                                            cx2,
                                                                            'nestedRef',
                                                                        )}
                                                                    />
                                                                </div>
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export const render = mimicJayElement(reactRender);
