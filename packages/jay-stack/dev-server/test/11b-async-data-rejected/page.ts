import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Rejected Test' }, {}))
    .withFastRender(async () => {
        const messagePromise = Promise.reject(new Error('Failed to load'));
        messagePromise.catch(() => {}); // Prevent unhandled rejection
        return phaseOutput({ message: messagePromise }, {});
    });
