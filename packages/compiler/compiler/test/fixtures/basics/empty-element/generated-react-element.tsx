import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export interface EmptyElementElementProps extends Jay4ReactElementProps<EmptyElementViewState> {}

export function render({
    vs,
    context,
}: EmptyElementElementProps): ReactElement<EmptyElementElementProps, any> {
    return (<div>
        {/* @ts-ignore */}
        <div attr="value"/>
    </div>);
}
