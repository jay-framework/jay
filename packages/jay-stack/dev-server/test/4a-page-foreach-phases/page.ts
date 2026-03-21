import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    PageFastViewState,
    PageInteractiveViewState,
    PageRefs,
    PageSlowViewState,
} from './page.jay-contract';
import { patch, REPLACE } from '@jay-framework/json-patch';

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<PageSlowViewState>(
            {
                title: 'Phase ForEach Test',
                slowItems: [
                    { _id: 's1', label: 'Slow A' },
                    { _id: 's2', label: 'Slow B' },
                ],
            },
            {},
        ),
    )
    .withFastRender(async () =>
        phaseOutput<PageFastViewState>(
            {
                fastItems: [
                    { _id: 'f1', label: 'Fast A' },
                    { _id: 'f2', label: 'Fast B' },
                ],
                fastMixedItems: [
                    { _id: 'm1', label: 'Mixed A', count: 10 },
                    { _id: 'm2', label: 'Mixed B', count: 20 },
                ],
                interactiveItems: [
                    { _id: 'i1', label: 'Interactive A', count: 100 },
                    { _id: 'i2', label: 'Interactive B', count: 200 },
                ],
            },
            {},
        ),
    );

export const page = builder.withInteractive(
    (_props, refs: PageRefs, fastViewState: Signals<PageInteractiveViewState>) => {
        let nextId = 3;
        const [interactiveItems, setInteractiveItems] = fastViewState.interactiveItems;
        const [fastMixedItems, setFastMixedItems] = fastViewState.fastMixedItems;

        refs.addButton.onclick(() => {
            setInteractiveItems([
                ...interactiveItems(),
                {
                    _id: `i${nextId}`,
                    label: `Interactive ${String.fromCharCode(64 + nextId)}`,
                    count: nextId * 100,
                },
            ]);
            nextId++;
        });

        refs.removeButton.onclick(() => {
            const current = interactiveItems();
            if (current.length > 0) {
                setInteractiveItems(current.slice(0, -1));
            }
        });

        refs.fastMixedItems.increment.onclick(({ viewState, coordinate }) => {
            const index = fastMixedItems().findIndex((_) => _._id === viewState._id);
            setFastMixedItems(
                patch(fastMixedItems(), [
                    { op: REPLACE, path: [index, 'count'], value: viewState.count + 1 },
                ]),
            );
        });

        refs.interactiveItems.increment.onclick(({ viewState, coordinate }) => {
            const index = interactiveItems().findIndex((_) => _._id === viewState._id);
            setInteractiveItems(
                patch(interactiveItems(), [
                    { op: REPLACE, path: [index, 'count'], value: viewState.count + 1 },
                ]),
            );
        });

        return {
            render: (): PageInteractiveViewState => ({
                interactiveItems: interactiveItems(),
                fastMixedItems: fastMixedItems(),
            }),
        };
    },
);
