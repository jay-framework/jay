import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

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
                        items: [
                            { _id: 'd1', label: 'D-One' },
                        ],
                    },
                ],
            },
            {},
        ),
    );

export const page = builder;
