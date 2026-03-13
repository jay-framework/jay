import {
    element as e,
    ReferencesManager,
    ConstructContext,
    childComp,
    adoptText,
    adoptElement,
    hydrateForEach,
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
import { widget } from '/widget.ts';
export function hydrate(rootElement, options) {
    const [itemsRefManager, [refAR1]] = ReferencesManager.for(options, [], [], [], ['aR1']);
    const [refManager, []] = ReferencesManager.for(options, [], [], [], [], {
        items: itemsRefManager,
    });
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                hydrateForEach(
                    '0',
                    (vs) => vs.items,
                    '_id',
                    () => [childComp(widget, (vs1) => ({ itemId: vs1._id }), refAR1())],
                    (vs1) => {
                        return e('div', { class: 'list' }, [
                            childComp(widget, (vs12) => ({ itemId: vs12._id }), refAR1()),
                        ]);
                    },
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
