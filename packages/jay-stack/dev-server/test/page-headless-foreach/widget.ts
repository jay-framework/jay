import {
    makeJayStackComponent,
    RenderPipeline,
} from '@jay-framework/fullstack-component';

interface WidgetProps {
    itemId: string;
}

// Fast-only widget (no slow phase) — safe for use inside forEach
const builder = makeJayStackComponent()
    .withProps<WidgetProps>()
    .withFastRender(async (props: WidgetProps) => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                label: `Item ${props.itemId}`,
                value: parseInt(props.itemId) * 10 || 0,
            },
            carryForward: {},
        }));
    });

export const widget = builder.withInteractive((props, refs, fastViewState, carryForward) => {
    return { render: () => ({}) };
});
