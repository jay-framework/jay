import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from '@jay-framework/4-react';

export interface DynamicTextInputTypesViewState {
    n1: number;
    n2: number;
}

export interface DynamicTextInputTypesElementRefs {}

export interface DynamicTextInputTypesElementProps
    extends Jay4ReactElementProps<DynamicTextInputTypesViewState> {}

export function reactRender({
    vs,
    context,
}: DynamicTextInputTypesElementProps): ReactElement<DynamicTextInputTypesElementProps, any> {
    return (
        <div>
            <div>{vs.n1}</div>
            <div>
                {vs.n1} + {vs.n2}
            </div>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
