import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, type Props } from '@jay-framework/component';
import type {
    HeaderContract,
    HeaderProps,
    HeaderRefs,
    HeaderSlowViewState,
    HeaderFastViewState,
} from './header.jay-contract';

interface HeaderCarryForward {
    itemId: string;
}

const builder = makeJayStackComponent<HeaderContract>()
    .withProps<HeaderProps>()
    .withSlowlyRender(async (props: HeaderProps) =>
        phaseOutput<HeaderSlowViewState, HeaderCarryForward>(
            { label: `Item ${props.itemId}` },
            { itemId: props.itemId },
        ),
    )
    .withFastRender(async (props: HeaderProps, carryForward: HeaderCarryForward) => {
        const Pipeline = RenderPipeline.for<HeaderFastViewState, HeaderCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { value: parseInt(carryForward.itemId) * 10 || 0 },
            carryForward,
        }));
    });

export const header = builder.withInteractive(
    (
        props: Props<HeaderProps>,
        refs: HeaderRefs,
        fastViewState: Signals<HeaderFastViewState>,
        carryForward: HeaderCarryForward,
    ) => {
        const [value, setValue] = createSignal(fastViewState.value[0]);

        refs.increment.onclick(() => {
            setValue(value() + 1);
        });

        return {
            render: () => ({
                value: value(),
            }),
        };
    },
);
