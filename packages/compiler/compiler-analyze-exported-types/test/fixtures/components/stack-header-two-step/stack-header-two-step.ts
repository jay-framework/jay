import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';

// Two-step builder: the chain is split across an intermediate `builder` variable,
// so the exported call's root identifier is `builder`, not `makeJayStackComponent`.
const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({}, {}));

export const StackHeaderTwoStep = builder.withInteractive(() => ({
    render: () => ({}),
}));
