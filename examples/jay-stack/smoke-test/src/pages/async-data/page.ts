import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Data Test' }, {}))
    .withFastRender(async () => {
        const asyncMessage = Promise.resolve('loaded async content');
        return phaseOutput({ asyncMessage }, {});
    });
