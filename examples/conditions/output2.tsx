import {Kindergarten} from '../../lib/kindergarden.js'
import {conditional, element as e, dynamicElement as de, JayElement} from '../../lib/element2';

interface ViewState {
    text1: string,
    text2: string,
    cond: boolean
}

export default function render(viewState: ViewState) {
    return de('div', {}, [
        conditional((newViewState) => newViewState.cond,
            e('div', {style: {cssText: 'color:red'}}, [viewState.text1], viewState,
                (elem, newData, oldData) => {
                if (oldData.text1 != newData.text1)
                    elem.textContent = newData.text1;
            })
        ),
        conditional((newViewState) => !newViewState.cond,
            e('div', {style: {cssText: 'color:green'}}, [viewState.text2], viewState,
                (elem, newData, oldData) => {
                if (oldData.text2 != newData.text2)
                    elem.textContent = newData.text2;
            })
        )
    ], viewState);
}

