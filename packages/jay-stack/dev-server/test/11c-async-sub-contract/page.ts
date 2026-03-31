import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Async Object Test' }, {}))
    .withFastRender(async () => {
        const userProfile = Promise.resolve({ name: 'Alice', email: 'alice@test.com' });
        return phaseOutput({ userProfile }, {});
    });
