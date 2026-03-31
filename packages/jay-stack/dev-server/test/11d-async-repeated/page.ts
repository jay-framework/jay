import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Array Test' }, {}))
    .withFastRender(async () => {
        const items = Promise.resolve([{ label: 'Alpha' }, { label: 'Beta' }, { label: 'Gamma' }]);
        return phaseOutput({ items }, {});
    });
