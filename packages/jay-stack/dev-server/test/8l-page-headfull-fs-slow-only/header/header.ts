import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { HeaderContract, HeaderProps, HeaderSlowViewState } from './header.jay-contract';

export const header = makeJayStackComponent<HeaderContract>()
    .withProps<HeaderProps>()
    .withSlowlyRender(async (props: HeaderProps) =>
        phaseOutput<HeaderSlowViewState, {}>({ logoUrl: props.logoUrl }, {}),
    );
