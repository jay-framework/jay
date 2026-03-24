import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput(
            {
                title: 'Nested Conditional',
                items: [
                    { _id: 'x1', name: 'Alpha', isActive: true },
                    { _id: 'x2', name: 'Beta', isActive: false },
                    { _id: 'x3', name: 'Gamma', isActive: true },
                ],
            },
            {},
        ),
    );
