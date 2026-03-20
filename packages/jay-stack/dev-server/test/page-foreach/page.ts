import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({}, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                title: 'ForEach Test',
                items: [
                    { _id: 'a', name: 'Alpha' },
                    { _id: 'b', name: 'Beta' },
                    { _id: 'c', name: 'Gamma' },
                ],
            },
            carryForward: {},
        }));
    });
