import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            {
                title: 'Nested Slow ForEach',
                categories: [
                    {
                        _id: 'c1',
                        name: 'Fruits',
                        items: [
                            { _id: 'i1', label: 'Apple' },
                            { _id: 'i2', label: 'Banana' },
                        ],
                    },
                    {
                        _id: 'c2',
                        name: 'Vegetables',
                        items: [
                            { _id: 'i3', label: 'Carrot' },
                            { _id: 'i4', label: 'Daikon' },
                        ],
                    },
                ],
            },
            {},
        ),
    );
