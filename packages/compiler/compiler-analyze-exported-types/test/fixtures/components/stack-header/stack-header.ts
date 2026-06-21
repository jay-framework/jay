import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

export const StackHeader = makeJayStackComponent().slowlyRender(async () => phaseOutput({}, {}));
