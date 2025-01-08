import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from 'jay-4-react';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export interface EmptyElementElementProps extends Jay4ReactElementProps<EmptyElementViewState> {}

export function render({
    vs,
    context,
}: EmptyElementElementProps): ReactElement<EmptyElementElementProps, any> {
    return (
        <div>
            {/* @ts-ignore */}
            <div attr="value" />
        </div>
    );
}

export const render2 = mimicJayElement(render);
