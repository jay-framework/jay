import {
    ReferencesManager,
    ConstructContext,
    childComp,
    adoptText,
    adoptElement,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
import { widget } from '/widget.ts';
export function hydrate(rootElement, options) {
    const [refManager, [refAR1]] = ReferencesManager.for(options, [], [], ['aR1'], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.pageTitle),
                childComp(widget, (vs) => ({ itemId: 1 }), refAR1()),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
