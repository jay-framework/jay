import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface WhitespaceAndTextViewState {
    text: string;
    text2: string;
    text3: string;
}

export interface WhitespaceAndTextElementRefs {}

export interface WhitespaceAndTextElementProps extends Jay4ReactElementProps<WhitespaceAndTextViewState> {}

export function render({
    vs,
    context,
}: WhitespaceAndTextElementProps): ReactElement<WhitespaceAndTextElementProps, any> {
    return <div>
        <div> multi-line text </div>
        <div>
            some text
            <span> </span>
            another text
        </div>
    </div>;
}
