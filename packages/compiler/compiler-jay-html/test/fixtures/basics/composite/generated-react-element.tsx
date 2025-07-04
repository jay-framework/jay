import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from '@jay-framework/4-react';

export interface CompositeViewState {
    text: string;
    text2: string;
}

export interface CompositeElementRefs {}

export interface CompositeElementProps extends Jay4ReactElementProps<CompositeViewState> {}

export function reactRender({
    vs,
    context,
}: CompositeElementProps): ReactElement<CompositeElementProps, any> {
    return (
        <div>
            <div>{vs.text}</div>
            <div>static</div>
            <div>{vs.text2}</div>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
