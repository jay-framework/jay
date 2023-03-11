import {element as e, dynamicText as dt} from '../../lib/element';
import {ConstructContext} from "../../lib/context";

interface ViewState {
    text: string
}

export default function render(viewState: ViewState) {
    return ConstructContext.withRootContext(viewState, () =>
        e('div', {}, [dt(vs => vs.text)])
    )
}

