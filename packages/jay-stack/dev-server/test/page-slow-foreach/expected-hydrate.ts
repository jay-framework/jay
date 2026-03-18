import {
    ReferencesManager,
    slowForEachItem,
    ConstructContext,
    adoptText,
    adoptElement,
// @ts-ignore
} from '/@fs/Users/yoav/work/jay/main/packages/runtime/runtime/dist/index.js';
export function hydrate(rootElement, options) {
    const [refManager, []] = ReferencesManager.for(options, [], [], [], []);
    const render = (viewState) =>
        ConstructContext.withHydrationRootContext(viewState, refManager, rootElement, () =>
            adoptElement('0', {}, [
                adoptText('0/0', (vs) => vs.title),
                slowForEachItem(
                    (vs) => vs.products,
                    0,
                    'p1',
                    () => adoptText('p1/0/0', (vs1) => vs1.name),
                    adoptText('p1/0/1', (vs1) => vs1.price),
                ),
                slowForEachItem(
                    (vs) => vs.products,
                    1,
                    'p2',
                    () => adoptText('p2/0/0', (vs1) => vs1.name),
                    adoptText('p2/0/1', (vs1) => vs1.price),
                ),
            ]),
        );
    return [refManager.getPublicAPI(), render];
}
