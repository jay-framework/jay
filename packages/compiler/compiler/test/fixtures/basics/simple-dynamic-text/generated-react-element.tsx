import { Jay4ReactElementProps } from 'jay-secure-react';
import { ReactElement } from 'react';

export interface SimpleDynamicTextViewState {
    s1: string;
}

export interface SimpleDynamicTextElementRefs {}

export interface SimpleDynamicProps extends Jay4ReactElementProps<SimpleDynamicTextViewState> {}

export function render({
    viewState,
    eventsContext,
}: SimpleDynamicProps): ReactElement<SimpleDynamicProps, any> {
    return <div>{viewState.s1}</div>;
}
