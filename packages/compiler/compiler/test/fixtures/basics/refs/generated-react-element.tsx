import {eventsFor, Jay4ReactElementProps} from 'jay-4-react';
import { ReactElement } from 'react';
import {HTMLElementProxy} from "jay-runtime";

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export interface RefsElementProps extends Jay4ReactElementProps<RefsViewState> {}

export function render({
    vs,
    eventsContext,
}: RefsElementProps): ReactElement<RefsElementProps, any> {
    return <div>
        <div {...eventsFor(eventsContext, 'ref1')}>{vs.text}</div>
        <div {...eventsFor(eventsContext, 'ref$')}>{vs.text}</div>
        <div>
            <div {...eventsFor(eventsContext, 'ref3')}>{vs.text}</div>
        </div>
    </div>;
}
