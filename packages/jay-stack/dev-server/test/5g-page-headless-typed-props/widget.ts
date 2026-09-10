import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { type Props } from '@jay-framework/component';
import type {
    WidgetContract,
    WidgetProps,
    WidgetRefs,
    WidgetSlowViewState,
    WidgetFastViewState,
    WidgetInteractiveViewState,
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
            viewState: {
                status: props.status,
                count: props.count,
                active: props.active,
            },
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
        const [status] = fastViewState.status;
        const [count, setCount] = fastViewState.count;

        refs.bump.onclick(() => {
            setCount(count() + 1);
        });

        return {
            render: (): WidgetInteractiveViewState => ({
                status: status(),
                count: count(),
            }),
        };
    },
);
