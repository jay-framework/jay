import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal } from '@jay-framework/component';

type Item = { _id: string; label: string };

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
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
        phaseOutput(
            {
                fastItems: [
                    { _id: 'f1', label: 'Fast A' },
                    { _id: 'f2', label: 'Fast B' },
                ],
                interactiveItems: [
                    { _id: 'i1', label: 'Interactive A' },
                    { _id: 'i2', label: 'Interactive B' },
                ],
            },
            {},
        ),
    );

export const page = builder.withInteractive(
    (
        props,
        refs: {
            addButton: { onclick: (fn: () => void) => void };
            removeButton: { onclick: (fn: () => void) => void };
        },
        fastViewState: Signals<{ interactiveItems: Item[] }>,
    ) => {
        let nextId = 3;
        const [interactiveItems, setInteractiveItems] = fastViewState.interactiveItems;

        refs.addButton.onclick(() => {
            setInteractiveItems([
                ...interactiveItems(),
                { _id: `i${nextId}`, label: `Interactive ${String.fromCharCode(64 + nextId)}` },
            ]);
            nextId++;
        });

        refs.removeButton.onclick(() => {
            const current = interactiveItems();
            if (current.length > 0) {
                setInteractiveItems(current.slice(0, -1));
            }
        });

        return {
            render: () => ({
                interactiveItems: interactiveItems(),
            }),
        };
    },
);
