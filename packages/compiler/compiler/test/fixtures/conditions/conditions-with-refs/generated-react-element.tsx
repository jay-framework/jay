import {HTMLElementProxy} from "jay-runtime";
import { Jay4ReactElementProps, eventsFor} from 'jay-4-react';
import { ReactElement } from 'react';

export interface ConditionsWithRefsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsWithRefsElementRefs {
    text1: HTMLElementProxy<ConditionsWithRefsViewState, HTMLDivElement>;
    text2: HTMLElementProxy<ConditionsWithRefsViewState, HTMLSpanElement>;
}

export interface ConditionsWithRefsElementProps extends Jay4ReactElementProps<ConditionsWithRefsViewState> {}

export function render({
    vs,
    eventsContext,
}: ConditionsWithRefsElementProps): ReactElement<ConditionsWithRefsElementProps, any> {
    return <div>
        {vs.cond && (<div {...eventsFor(eventsContext, 'text1')} style={{color: "red"}}>{vs.text1}</div>)}
        {!vs.cond && (<div style={{color: "green"}}>
            <span {...eventsFor(eventsContext, 'text2')}>{vs.text2}</span>
        </div>)}
    </div>;
}
