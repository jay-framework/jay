import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import { REPLACE } from '@jay-framework/json-patch';

interface Item {
    _id: string;
    name: string;
    isActive: boolean;
}

interface FastViewState {
    title: string;
    items: Item[];
}

const initialItems: Item[] = [
    { _id: 'x1', name: 'Alpha', isActive: true },
    { _id: 'x2', name: 'Beta', isActive: false },
    { _id: 'x3', name: 'Gamma', isActive: true },
];

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput(
            {
                title: 'Nested Conditional',
                items: initialItems,
            },
            {},
        ),
    );

export const page = builder.withInteractive(
    (
        _props,
        refs: {
            items: {
                toggleButton: {
                    onclick: (fn: (ctx: { viewState: Item }) => void) => void;
                };
            };
        },
        fastViewState: Signals<FastViewState>,
    ) => {
        const [items, setItems] = fastViewState.items;

        refs.items.toggleButton.onclick(({ viewState }) => {
            const index = items().findIndex((_) => _._id === viewState._id);
            if (index >= 0) {
                const patch = [...items()];
                patch[index] = { ...patch[index], isActive: !viewState.isActive };
                setItems(patch);
            }
        });

        return {
            render: () => ({
                items: items(),
            }),
        };
    },
);
