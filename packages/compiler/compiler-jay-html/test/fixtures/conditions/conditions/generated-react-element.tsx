import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from 'jay-4-react';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export interface ConditionsElementProps extends Jay4ReactElementProps<ConditionsViewState> {}

export function reactRender({
    vs,
    context,
}: ConditionsElementProps): ReactElement<ConditionsElementProps, any> {
    return (
        <div>
            {vs.cond && <div style={{ color: 'red' }}>{vs.text1}</div>}
            {!vs.cond && <div style={{ color: 'green' }}>{vs.text2}</div>}
        </div>
    );
}

export const render = mimicJayElement(reactRender);
