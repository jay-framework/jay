import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput(
            {
                title: 'Nested Fast ForEach',
                groups: [
                    {
                        _id: 'g1',
                        name: 'Group A',
                        items: [
                            { _id: 'a1', label: 'Item A1' },
                            { _id: 'a2', label: 'Item A2' },
                        ],
                    },
                    {
                        _id: 'g2',
                        name: 'Group B',
                        items: [
                            { _id: 'b1', label: 'Item B1' },
                            { _id: 'b2', label: 'Item B2' },
                            { _id: 'b3', label: 'Item B3' },
                        ],
                    },
                ],
            },
            {},
        ),
    );
