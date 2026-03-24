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
    )
    .withFastRender(async () =>
        phaseOutput(
            {
                categories: [
                    {
                        _id: 'c1',
                        items: [
                            { _id: 'i1', count: 10 },
                            { _id: 'i2', count: 20 },
                        ],
                    },
                    {
                        _id: 'c2',
                        items: [
                            { _id: 'i3', count: 30 },
                            { _id: 'i4', count: 40 },
                        ],
                    },
                ],
            },
            {},
        ),
    );
