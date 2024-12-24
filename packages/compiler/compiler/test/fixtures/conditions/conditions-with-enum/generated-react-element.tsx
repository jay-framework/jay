import { Jay4ReactElementProps} from 'jay-4-react';
import { ReactElement } from 'react';

export enum Cond {
    one,
    two,
    three,
}

export interface ConditionsWithEnumViewState {
    text1: string;
    text2: string;
    text3: string;
    cond: Cond;
}

export interface ConditionsWithEnumElementRefs {}

export interface ConditionsWithEnumElementProps extends Jay4ReactElementProps<ConditionsWithEnumViewState> {}

export function render({
    vs,
    eventsContext,
}: ConditionsWithEnumElementProps): ReactElement<ConditionsWithEnumElementProps, any> {
    return <div>
        {vs.cond === Cond.one && (<div style={{color: "red"}}>{vs.text1}</div>)}
        {vs.cond === Cond.two && (<div style={{color: "red"}}>{vs.text2}</div>)}
        {vs.cond !== Cond.one && (<div style={{color: "green"}}>{vs.text3}</div>)}
    </div>;
}
