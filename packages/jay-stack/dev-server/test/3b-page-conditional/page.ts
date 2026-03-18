import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () => phaseOutput({ isActive: true, message: 'Conditional Test' }, {}));
