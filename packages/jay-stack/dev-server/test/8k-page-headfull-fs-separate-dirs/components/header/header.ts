import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { type Props } from '@jay-framework/component';
import type {
    HeaderContract,
    HeaderProps,
    HeaderRefs,
    HeaderSlowViewState,
    HeaderFastViewState,
} from './header.jay-contract';

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
        const Pipeline = RenderPipeline.for<HeaderFastViewState, HeaderCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { cartCount: 5 },
            carryForward,
        }));
    });

export const TestHeader = builder.withInteractive(
    (
        props: Props<HeaderProps>,
        refs: HeaderRefs,
        fastViewState: Signals<HeaderFastViewState>,
        carryForward: HeaderCarryForward,
    ) => {
        const [cartCount, setCartCount] = fastViewState.cartCount;

        refs.increment.onclick(() => {
            setCartCount(cartCount() + 1);
        });

        return {
            render: () => ({
                cartCount: cartCount(),
            }),
        };
    },
);
