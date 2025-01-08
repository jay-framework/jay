import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from 'jay-4-react';

export interface StylesViewState {
    text1: string;
    text2: string;
}

export interface StylesElementRefs {}

export interface StylesElementProps extends Jay4ReactElementProps<StylesViewState> {}

export function render({ vs, context }: StylesElementProps): ReactElement<StylesElementProps, any> {
    return (
        <div>
            <div style={{ color: 'red' }}>{vs.text1}</div>
            <div style={{ color: 'green' }}>{vs.text2}</div>
        </div>
    );
}

export const render2 = mimicJayElement(render);
