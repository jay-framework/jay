import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from 'jay-4-react';

export interface Thing {
    name: string;
    completed: boolean;
    cost: number;
    id: string;
}

export interface CollectionsViewState {
    title: string;
    things: Array<Thing>;
}

export interface CollectionsElementRefs {}

export interface CollectionsElementProps extends Jay4ReactElementProps<CollectionsViewState> {}

export function render({
    vs,
    context,
}: CollectionsElementProps): ReactElement<CollectionsElementProps, any> {
    return (
        <div>
            <h1>{vs.title}</h1>
            <div>
                {vs.things.map((vs1: Thing) => {
                    const cx1 = context.child(vs1.id, vs1);
                    return (
                        <div key={vs1.id}>
                            <span
                                style={{ color: 'green', width: '100px', display: 'inline-block' }}
                            >
                                {vs1.name}
                            </span>
                            <span style={{ color: 'red', width: '100px', display: 'inline-block' }}>
                                {vs1.completed}
                            </span>
                            <span
                                style={{ color: 'blue', width: '100px', display: 'inline-block' }}
                            >
                                {vs1.cost}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export const render2 = mimicJayElement(render);
