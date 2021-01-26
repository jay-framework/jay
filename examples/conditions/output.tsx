import {conditional, textElement as text, dynamicElement as de} from '../../lib/element';

interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    return de('div', {}, [
        conditional((newViewState) => newViewState.cond,
            text('div', {style: {cssText: 'color:red'}}, viewState, vs => vs.text1)
        ),
        conditional((newViewState) => !newViewState.cond,
            text('div', {style: {cssText: 'color:green'}}, viewState,vs => vs.text2)
        )
    ], viewState);
}

