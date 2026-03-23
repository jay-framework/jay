import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            {
                title: 'SlowForEach Headfull FS',
                items: [{ _id: '1' }, { _id: '2' }],
            },
            {},
        ),
    );
