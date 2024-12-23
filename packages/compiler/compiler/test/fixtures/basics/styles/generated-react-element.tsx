import { Jay4ReactElementProps } from 'jay-4-react';
import { ReactElement } from 'react';

export interface StylesViewState {
    text1: string;
    text2: string;
}

export interface StylesElementRefs {}

export interface StylesElementProps extends Jay4ReactElementProps<StylesViewState> {}

export function render({
    vs,
    eventsContext,
}: StylesElementProps): ReactElement<StylesElementProps, any> {
    return <div>
        <div>
            <div style={{color:"red"}}>{vs.text1}</div>
            <div style={{color:"green"}}>{vs.text2}</div>
        </div>
    </div>;
}
