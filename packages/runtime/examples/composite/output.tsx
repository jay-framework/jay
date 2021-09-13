import {element as e, dynamicText as dt, ConstructContext} from '../../lib/element';

interface ViewState {
    text: string
    text2: string
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [
            e('div', {}, [dt(vs => vs.text)]),
            e('div', {}, ['static']),
            e('div', {}, [dt(vs => vs.text2)])
        ])
    )
}

