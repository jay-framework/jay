import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface EmptyElementViewState {}

export interface EmptyElementElementRefs {}

export interface EmptyElementElementProps extends Jay4ReactElementProps<EmptyElementViewState> {}

export function render({
    vs,
    eventsContext,
}: EmptyElementElementProps): ReactElement<EmptyElementElementProps, any> {
    return (<div>
        <div attr="value"></div>
    </div>);
}
