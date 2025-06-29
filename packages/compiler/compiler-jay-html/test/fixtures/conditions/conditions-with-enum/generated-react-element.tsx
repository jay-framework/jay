import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from '@jay-framework/4-react';

export enum CondOfConditionsWithEnumViewState {
    one,
    two,
    three,
}

export interface ConditionsWithEnumViewState {
    text1: string;
    text2: string;
    text3: string;
    cond: CondOfConditionsWithEnumViewState;
}

export interface ConditionsWithEnumElementRefs {}

export interface ConditionsWithEnumElementProps
    extends Jay4ReactElementProps<ConditionsWithEnumViewState> {}

export function reactRender({
    vs,
    context,
}: ConditionsWithEnumElementProps): ReactElement<ConditionsWithEnumElementProps, any> {
    return (
        <div>
            {vs.cond === CondOfConditionsWithEnumViewState.one && (
                <div style={{ color: 'red' }}>{vs.text1}</div>
            )}
            {vs.cond === CondOfConditionsWithEnumViewState.two && (
                <div style={{ color: 'red' }}>{vs.text2}</div>
            )}
            {vs.cond !== CondOfConditionsWithEnumViewState.one && (
                <div style={{ color: 'green' }}>{vs.text3}</div>
            )}
        </div>
    );
}

export const render = mimicJayElement(reactRender);
