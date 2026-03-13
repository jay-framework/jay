import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Conditional Headless' }, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { showWidget: true },
            carryForward: {},
        }));
    });
