import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import type { Props } from '@jay-framework/component';
import type {
    WidgetContract,
    WidgetProps,
    WidgetRefs,
    WidgetSlowViewState,
    WidgetFastViewState,
} from './widget.jay-contract';

interface WidgetCarryForward {
    itemId: string;
}

const builder = makeJayStackComponent<WidgetContract>()
    .withProps<WidgetProps>()
    .withSlowlyRender(async (props: WidgetProps) =>
        phaseOutput<WidgetSlowViewState, WidgetCarryForward>(
            { label: `Item ${props.itemId}` },
            { itemId: props.itemId },
        ),
    )
    .withFastRender(async (props: WidgetProps, carryForward: WidgetCarryForward) => {
        const Pipeline = RenderPipeline.for<WidgetFastViewState, WidgetCarryForward>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { value: parseInt(carryForward.itemId) * 10 || 0 },
            carryForward,
        }));
    });

export const widget = builder.withInteractive(
    (
        props: Props<WidgetProps>,
        refs: WidgetRefs,
        fastViewState: Signals<WidgetFastViewState>,
        carryForward: WidgetCarryForward,
    ) => {
        return {
            render: () => ({
                value: fastViewState.value[0],
            }),
        };
    },
);
