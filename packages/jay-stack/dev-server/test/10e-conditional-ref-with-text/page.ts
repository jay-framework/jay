import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';

interface Item {
    _id: string;
    name: string;
    inStock: boolean;
}

interface FastViewState {
    title: string;
    items: Item[];
}

const initialItems: Item[] = [
    { _id: 'a1', name: 'Small', inStock: true },
    { _id: 'a2', name: 'Medium', inStock: false },
    { _id: 'a3', name: 'Large', inStock: true },
];

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput(
            {
                title: 'Conditional Ref',
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
                choiceButton: {
                    onclick: (fn: (ctx: { viewState: Item }) => void) => void;
                };
            };
        },
        fastViewState: Signals<FastViewState>,
    ) => {
        const [items, setItems] = fastViewState.items;

        refs.items.choiceButton.onclick(({ viewState }) => {
            const index = items().findIndex((_) => _._id === viewState._id);
            if (index >= 0) {
                const patch = [...items()];
                patch[index] = { ...patch[index], inStock: !viewState.inStock };
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
