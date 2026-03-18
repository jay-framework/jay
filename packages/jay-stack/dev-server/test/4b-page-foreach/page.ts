import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput(
            {
                title: 'ForEach Test',
                items: [
                    { _id: 'a', name: 'Alpha' },
                    { _id: 'b', name: 'Beta' },
                    { _id: 'c', name: 'Gamma' },
                ],
            },
            {},
        ),
    );
