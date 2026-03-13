import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';

export const page = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'ForEach Headless' }, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                items: [
                    { _id: '1' },
                    { _id: '2' },
                    { _id: '3' },
                ],
            },
            carryForward: {},
        }));
    });
