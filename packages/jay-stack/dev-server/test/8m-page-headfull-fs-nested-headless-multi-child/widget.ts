import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal, type Props } from '@jay-framework/component';
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
            // Server returns showBadge: false (simulates no cookie/client-only data)
            viewState: { value: parseInt(carryForward.itemId) * 10 || 0, showBadge: false },
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
        const [value, setValue] = fastViewState.value;
        // Client overrides showBadge to true (simulates cookie/localStorage read)
        const [showBadge, setShowBadge] = fastViewState.showBadge;
        setShowBadge(true);

        refs.increment.onclick(() => {
            setValue(value() + 1);
        });

        return {
            render: () => ({
                value: value(),
                showBadge: showBadge(),
            }),
        };
    },
);
