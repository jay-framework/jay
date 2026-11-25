import {
    makeJayStackComponent,
    RenderPipeline,
    // @ts-ignore
} from '@jay-framework/fullstack-component';

// Fast phase always redirects — the page body is never rendered
export const page = makeJayStackComponent()
    .withProps<{}>()
    .withFastRender(async () =>
        RenderPipeline.for()
            .redirect(302, '/target?from=redirect-page')
            .toPhaseOutput(() => ({ viewState: {}, carryForward: {} })),
    )
    .withInteractive(() => ({ render: () => ({}) }));
