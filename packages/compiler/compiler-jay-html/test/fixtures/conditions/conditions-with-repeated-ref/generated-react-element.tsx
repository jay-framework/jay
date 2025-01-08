import { HTMLElementProxy } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from 'jay-4-react';

export interface ConditionsWithRepeatedRefViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRepeatedRefElementRefs {
    text1: HTMLElementProxy<ConditionsWithRepeatedRefViewState, HTMLDivElement>;
}

export interface ConditionsWithRepeatedRefElementProps
    extends Jay4ReactElementProps<ConditionsWithRepeatedRefViewState> {}

export function render({
    vs,
    context,
}: ConditionsWithRepeatedRefElementProps): ReactElement<
    ConditionsWithRepeatedRefElementProps,
    any
> {
    return (
        <div>
            {vs.cond && (
                <div {...eventsFor(context, 'text1')} style={{ color: 'red' }}>
                    <h1>{vs.text1}</h1>
                </div>
            )}
            {!vs.cond && (
                <div {...eventsFor(context, 'text1')} style={{ color: 'green' }}>
                    <span>{vs.text2}</span>
                </div>
            )}
        </div>
    );
}

export const render2 = mimicJayElement(render);
