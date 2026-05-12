import { makeJayStackComponent, partialRender } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        partialRender({ siteName: 'Test Shop' }, { itemCount: 3 }),
    )
    .withFastRender(async (_props: {}, carryForward: { itemCount: number }) =>
        partialRender({ itemCount: carryForward.itemCount }, {}),
    );
