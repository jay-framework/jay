import {
    element as e,
    dynamicText as dt,
    ReferencesManager,
    conditional as c,
    dynamicElement as de,
    ConstructContext,
    childComp,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
import { widget } from '/widget.ts';
export function render(options) {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render2 = (viewState) =>
        ConstructContext.withRootContext(viewState, refManager, () =>
            de('div', {}, [
                e('h1', {}, [dt((vs) => vs.title)]),
                c(
                    (vs) => vs.showWidget,
                    () => childComp(widget, (vs) => ({ itemId: 1 }), refAR1()),
                ),
                c(
                    (vs) => !vs.showWidget,
                    () => e('p', {}, ['Widget hidden']),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render2];
}
