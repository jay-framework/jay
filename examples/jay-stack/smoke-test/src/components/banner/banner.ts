import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import type { BannerContract, BannerSlowViewState } from './banner.jay-contract';

export interface BannerProps {
    text: string;
}

export const banner = makeJayStackComponent<BannerContract>()
    .withProps<BannerProps>()
    .withSlowlyRender(async (props: BannerProps) =>
        phaseOutput<BannerSlowViewState, {}>({ bannerText: props.text }, {}),
    );
