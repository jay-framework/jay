import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import { patch, REPLACE } from '@jay-framework/json-patch';

interface CategoryFastState {
    _id: string;
    isActive: boolean;
    items: Array<{ _id: string; label: string }>;
}

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            {
                title: 'Nested Combination',
                categories: [
                    { _id: 'c1', name: 'Enabled', showDetails: true },
                    { _id: 'c2', name: 'Disabled', showDetails: false },
                ],
            },
            {},
        ),
    )
    .withFastRender(async () =>
        phaseOutput(
            {
                categories: [
                    {
                        _id: 'c1',
                        isActive: true,
                        items: [
                            { _id: 'e1', label: 'E-One' },
                            { _id: 'e2', label: 'E-Two' },
                        ],
                    },
                    {
                        _id: 'c2',
                        isActive: false,
                        items: [{ _id: 'd1', label: 'D-One' }],
                    },
                ],
            },
            {},
        ),
    );

export const page = builder.withInteractive(
    (
        _props,
        refs: {
            categories: {
                toggleButton: {
                    onclick: (fn: (ctx: { viewState: CategoryFastState }) => void) => void;
                };
            };
        },
        fastViewState: Signals<{ categories: CategoryFastState[] }>,
    ) => {
        const [categories, setCategories] = fastViewState.categories;

        refs.categories.toggleButton.onclick(({ viewState }) => {
            const index = categories().findIndex((_) => _._id === viewState._id);
            setCategories(
                patch(categories(), [
                    { op: REPLACE, path: [index, 'isActive'], value: !viewState.isActive },
                ]),
            );
        });

        return {
            render: () => ({
                categories: categories(),
            }),
        };
    },
);
