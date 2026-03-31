import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Multiple Async Test' }, {}))
    .withFastRender(async () => {
        const data1 = Promise.resolve('First resolved');
        const data2 = Promise.reject(new Error('Second failed'));
        data2.catch(() => {}); // Prevent unhandled rejection
        return phaseOutput({ data1, data2 }, {});
    });
