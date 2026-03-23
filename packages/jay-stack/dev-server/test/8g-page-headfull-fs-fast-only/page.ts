import {
    makeJayStackComponent,
    RenderPipeline,
    type Signals,
    // @ts-ignore
} from '@jay-framework/fullstack-component';

// No withSlowlyRender — fast + interactive only
export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { title: 'Fast Only Headfull FS' },
            carryForward: {},
        }));
    })
    .withInteractive((props, refs, fastViewState: Signals<{ title: string }>) => {
        return {
            render: () => ({
                title: fastViewState.title[0],
            }),
        };
    });
