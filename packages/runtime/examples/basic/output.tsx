import {element as e, dynamicText as dt, ConstructContext} from '../../lib/element';

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [dt(vs => vs.text)])
    )
}

