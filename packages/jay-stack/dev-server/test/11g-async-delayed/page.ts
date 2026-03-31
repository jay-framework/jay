import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Delayed Test' }, {}))
    .withFastRender(async () => {
        const message = new Promise<string>((resolve) =>
            setTimeout(() => resolve('Delayed response'), 100),
        );
        return phaseOutput({ message }, {});
    });
