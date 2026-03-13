import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            {
                title: 'SlowForEach Test',
                products: [
                    { _id: 'p1', name: 'Widget A', price: 29.99 },
                    { _id: 'p2', name: 'Widget B', price: 49.99 },
                ],
            },
            {},
        ),
    );
