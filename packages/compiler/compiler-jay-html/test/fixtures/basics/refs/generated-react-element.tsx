import { HTMLElementProxy } from 'jay-runtime';
import { ReactElement } from 'react';
import { Jay4ReactElementProps, eventsFor, mimicJayElement } from 'jay-4-react';

export interface RefsViewState {
    text: string;
}

export interface RefsElementRefs {
    ref1: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref: HTMLElementProxy<RefsViewState, HTMLDivElement>;
    ref3: HTMLElementProxy<RefsViewState, HTMLDivElement>;
}

export interface RefsElementProps extends Jay4ReactElementProps<RefsViewState> {}

export function reactRender({
    vs,
    context,
}: RefsElementProps): ReactElement<RefsElementProps, any> {
    return (
        <div>
            <div {...eventsFor(context, 'ref1')}>{vs.text}</div>
            <div {...eventsFor(context, 'ref')}>{vs.text}</div>
            <div>
                <div {...eventsFor(context, 'ref3')}>{vs.text}</div>
            </div>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
