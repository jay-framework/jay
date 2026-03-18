import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput({ title: 'Hello Dynamic' }, {}))
    .withFastRender(async () =>
        phaseOutput({ fastCount: 10, interactiveCount: 20 }, {}))
