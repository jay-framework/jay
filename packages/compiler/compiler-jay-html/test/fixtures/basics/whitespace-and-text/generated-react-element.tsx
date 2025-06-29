import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from '@jay-framework/4-react';

export interface WhitespaceAndTextViewState {
    text: string;
    text2: string;
    text3: string;
}

export interface WhitespaceAndTextElementRefs {}

export interface WhitespaceAndTextElementProps
    extends Jay4ReactElementProps<WhitespaceAndTextViewState> {}

export function reactRender({
    vs,
    context,
}: WhitespaceAndTextElementProps): ReactElement<WhitespaceAndTextElementProps, any> {
    return (
        <div>
            <div> multi-line text </div>
            <div>
                some text
                <span> </span>
                another text
            </div>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
