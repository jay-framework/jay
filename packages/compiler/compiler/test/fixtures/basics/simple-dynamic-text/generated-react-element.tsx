import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface SimpleDynamicTextViewState {
    s1: string;
}

export interface SimpleDynamicTextElementRefs {}

export interface SimpleDynamicTextElementProps extends Jay4ReactElementProps<SimpleDynamicTextViewState> {}

export function render({
    vs,
    context,
}: SimpleDynamicTextElementProps): ReactElement<SimpleDynamicTextElementProps, any> {
    return <div>{vs.s1}</div>;
}
