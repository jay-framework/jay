import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface SimpleStaticTextViewState {
    s1: string;
}

export interface SimpleStaticTextElementRefs {}

export interface SimpleStaticTextElementProps extends Jay4ReactElementProps<SimpleStaticTextViewState> {}

export function render({
    vs,
    eventsContext,
}: SimpleStaticTextElementProps): ReactElement<SimpleStaticTextElementProps, any> {
    return <div>static text</div>;
}
