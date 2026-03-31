import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Data Test' }, {}))
    .withFastRender(async () => {
        const messagePromise = Promise.resolve('Hello from async!');
        return phaseOutput({ message: messagePromise }, {});
    });
