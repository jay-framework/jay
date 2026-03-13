import {
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    childComp,
    adoptText,
    adoptElement,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
import { widget } from '/widget.ts';
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAR1, refAR2]] = ReferencesManager.for(
        options,
        [],
        [],
        [],
        ['aR1', 'aR2'],
    );
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                slowForEachItem(
                    (vs) => vs.items,
                    0,
                    '1',
                    () => childComp(widget, (vs1) => ({ itemId: 1 }), refAR1()),
                ),
                slowForEachItem(
                    (vs) => vs.items,
                    1,
                    '2',
                    () => childComp(widget, (vs1) => ({ itemId: 2 }), refAR2()),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
