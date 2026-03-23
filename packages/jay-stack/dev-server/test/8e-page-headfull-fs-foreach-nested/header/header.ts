import {
    makeJayStackComponent,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { type Props } from '@jay-framework/component';
import type {
    HeaderContract,
    HeaderProps,
    HeaderRefs,
    HeaderFastViewState,
} from './header.jay-contract';

interface HeaderCarryForward {
    itemId: string;
}

// Fast-only header with carryForward for step-based increment.
// Uses carryForward.itemId as the increment step to verify it reaches the client.
const builder = makeJayStackComponent<HeaderContract>()
    .withProps<HeaderProps>()
    .withFastRender(async (props: HeaderProps) => {
        const Pipeline = RenderPipeline.for<HeaderFastViewState, HeaderCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                label: `Item ${props.itemId}`,
                value: parseInt(props.itemId) * 10 || 0,
            },
            carryForward: { itemId: props.itemId },
        }));
    });

export const header = builder.withInteractive(
    (
        props: Props<HeaderProps>,
        refs: HeaderRefs,
        fastViewState: Signals<HeaderFastViewState>,
        carryForward: HeaderCarryForward,
    ) => {
        const [value, setValue] = fastViewState.value;
        // Use carryForward.itemId as the increment step to verify it reaches the client.
        const step = parseInt(carryForward.itemId) || 1;

        refs.increment.onclick(() => {
            setValue(value() + step);
        });

        return {
            render: () => ({
                label: `Item ${props.itemId()}`,
                value: value(),
            }),
        };
    },
);
