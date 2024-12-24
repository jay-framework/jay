import { Jay4ReactElementProps} from 'jay-4-react';
import { ReactElement } from 'react';

export interface ConditionsViewState {
    text1: string;
    text2: string;
    cond: boolean;
}

export interface ConditionsElementRefs {}

export interface ConditionsElementProps extends Jay4ReactElementProps<ConditionsViewState> {}

export function render({
    vs,
    context,
}: ConditionsElementProps): ReactElement<ConditionsElementProps, any> {
    return <div>
        {vs.cond && (<div style={{color:"red"}}>{vs.text1}</div>)}
        {!vs.cond && (<div style={{color:"green"}}>{vs.text2}</div>)}
    </div>;
}
