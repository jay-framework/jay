import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export interface CompositeElementProps extends Jay4ReactElementProps<CompositeViewState> {}

export function render({
    vs,
    eventsContext,
}: CompositeElementProps): ReactElement<CompositeElementProps, any> {
    return <div>
        <div>{vs.text}</div>
        <div>static</div>
        <div>{vs.text2}</div>
    </div>;
}
