import { ReactElement } from 'react';
import { Jay4ReactElementProps, mimicJayElement } from 'jay-4-react';

export interface O1 {
    s2: string;
    n2: number;
}

export interface A1 {
    s3: string;
    n3: number;
}

export interface DataTypesViewState {
    s1: string;
    n1: number;
    b1: boolean;
    o1: O1;
    a1: Array<A1>;
}

export interface DataTypesElementRefs {}

export interface DataTypesElementProps extends Jay4ReactElementProps<DataTypesViewState> {}

export function reactRender({
    vs,
    context,
}: DataTypesElementProps): ReactElement<DataTypesElementProps, any> {
    return (
        <div>
            <span>{vs.s1}</span>
            <span>{vs.n1}</span>
            <span>{vs.b1}</span>
            <span>{vs.o1?.s2}</span>
            <span>{vs.o1?.n2}</span>
        </div>
    );
}

export const render = mimicJayElement(reactRender);
