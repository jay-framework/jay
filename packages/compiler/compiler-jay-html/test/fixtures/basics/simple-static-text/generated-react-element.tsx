import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from '@jay-framework/4-react';

export interface SimpleStaticTextViewState {
    s1: string;
}

export interface SimpleStaticTextElementRefs {}

export interface SimpleStaticTextElementProps
    extends Jay4ReactElementProps<SimpleStaticTextViewState> {}

export function reactRender({
    vs,
    context,
}: SimpleStaticTextElementProps): ReactElement<SimpleStaticTextElementProps, any> {
    return <div>static text</div>;
}

export const render = mimicJayElement(reactRender);
