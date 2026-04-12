import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
} from '@jay-framework/fullstack-component';
import type { HeaderContract, HeaderProps, HeaderSlowViewState } from './header.jay-contract';

interface HeaderCarryForward {
    logoUrl: string;
}

const builder = makeJayStackComponent<HeaderContract>()
    .withProps<HeaderProps>()
    .withSlowlyRender(async (props: HeaderProps) =>
        phaseOutput<HeaderSlowViewState, HeaderCarryForward>(
            { logoUrl: props.logoUrl },
            { logoUrl: props.logoUrl },
        ),
    )
    .withFastRender(async (props: HeaderProps, carryForward: HeaderCarryForward) => {
        const Pipeline = RenderPipeline.for<{}, HeaderCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {},
            carryForward,
        }));
    });

export const header = builder.withInteractive(() => {
    return {
        render: () => ({}),
    };
});
