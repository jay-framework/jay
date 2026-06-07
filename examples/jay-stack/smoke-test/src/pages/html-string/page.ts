import {
    makeJayStackComponent,
    RenderPipeline,
    type PageProps,
} from '@jay-framework/fullstack-component';
import type {
    PageContract,
    PageFastViewState,
} from './page.jay-contract';

export const page = makeJayStackComponent<PageContract>()
    .withProps<PageProps>()
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for<PageFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                title: '<b>This should be escaped</b>',
                richContent: '<b>This should be bold</b> and <em>italic</em>',
            },
            carryForward: {},
        }));
    });
