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
} from './widget.jay-contract';

// Fast-only widget (no slow phase) — safe for use inside forEach
const builder = makeJayStackComponent<WidgetContract>()
    .withProps<WidgetProps>()
    .withFastRender(async (props: WidgetProps) => {
        const Pipeline = RenderPipeline.for<WidgetFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                label: `Item ${props.itemId}`,
                value: parseInt(props.itemId) * 10 || 0,
            },
            carryForward: {},
        }));
    })
    .withClientDefaults((props: WidgetProps) => ({
        viewState: {
            label: `Item ${props.itemId}`,
            value: parseInt(props.itemId) * 10 || 0,
        },
        carryForward: {},
    }));

export const widget = builder.withInteractive(
    (
        props: Props<WidgetProps>,
        refs: WidgetRefs,
        fastViewState: Signals<WidgetFastViewState>,
        carryForward: {},
    ) => {
        const [value, setValue] = fastViewState.value;

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
