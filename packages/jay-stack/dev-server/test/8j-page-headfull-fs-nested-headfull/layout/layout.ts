import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';
import type { LayoutContract, LayoutSlowViewState } from './layout.jay-contract';

interface LayoutCarryForward {
    sidebarLabel: string;
}

const builder = makeJayStackComponent<LayoutContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<LayoutSlowViewState, LayoutCarryForward>(
            { sidebarLabel: 'Sidebar' },
            { sidebarLabel: 'Sidebar' },
        ),
    )
    .withFastRender(async (props: {}, carryForward: LayoutCarryForward) => {
        const Pipeline = RenderPipeline.for<{}, LayoutCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {},
            carryForward,
        }));
    });

export const Layout = builder.withInteractive(() => {
    return {
        render: () => ({}),
    };
});
