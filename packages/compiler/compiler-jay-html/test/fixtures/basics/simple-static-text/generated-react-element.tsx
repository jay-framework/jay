import { ReactElement } from 'react';
import { Jay4ReactElementProps } from 'jay-4-react';

export interface SimpleStaticTextViewState {
    s1: string;
}

export interface SimpleStaticTextElementRefs {}

export interface SimpleStaticTextElementProps
    extends Jay4ReactElementProps<SimpleStaticTextViewState> {}

export function render({
    vs,
    context,
}: SimpleStaticTextElementProps): ReactElement<SimpleStaticTextElementProps, any> {
    return <div>static text</div>;
}
