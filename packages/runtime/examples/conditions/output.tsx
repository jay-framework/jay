import {conditional, dynamicText as dt, dynamicElement as de, element as e} from '../../lib/element';
import {ConstructContext} from "../../lib/context";

interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, () =>
        de('div', {}, [
            conditional((newViewState) => newViewState.cond,
                e('div', {style: {cssText: 'color:red'}}, [dt(vs => vs.text1)])
            ),
            conditional((newViewState) => !newViewState.cond,
                e('div', {style: {cssText: 'color:green'}}, [dt(vs => vs.text2)])
            )
        ])
    )
}

