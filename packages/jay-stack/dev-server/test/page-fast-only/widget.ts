import {
    makeJayStackComponent,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, type Props } from '@jay-framework/component';
import type {
    WidgetContract,
    WidgetProps,
    WidgetRefs,
    WidgetFastViewState,
// @ts-ignore
} from './widget.jay-contract';

interface WidgetCarryForward {
    itemId: string;
}

// Fast-only widget (no slow phase) — safe for use inside forEach.
// No clientDefaults — this tests that server data lookup works correctly.
// Uses carryForward to pass itemId to the interactive phase, which renders
// it as part of the label to verify carry forward reaches the client.
const builder = makeJayStackComponent<WidgetContract>()
    .withProps<WidgetProps>()
    .withFastRender(async (props: WidgetProps) => {
        const Pipeline = RenderPipeline.for<WidgetFastViewState, WidgetCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                label: `Item ${props.itemId}`,
                value: parseInt(props.itemId) * 10 || 0,
            },
            carryForward: { itemId: props.itemId },
        }));
    });

export const widget = builder.withInteractive(
    (
        props: Props<WidgetProps>,
        refs: WidgetRefs,
        fastViewState: Signals<WidgetFastViewState>,
        carryForward: WidgetCarryForward,
    ) => {
        const [value, setValue] = fastViewState.value;
        // Use carryForward.itemId as the increment step to verify it reaches the client.
        // itemId "1" → step 1, itemId "2" → step 2.
        const step = parseInt(carryForward.itemId) || 1;

        refs.increment.onclick(() => {
            setValue(value() + step);
        });

        return {
            render: () => ({
                value: value(),
            }),
        };
    },
);
