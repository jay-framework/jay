import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal } from '@jay-framework/component';

const initialItems = [
    { _id: '1', name: 'Alpha' },
    { _id: '2', name: 'Beta' },
];

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'Nested ForEach Test' }, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { items: initialItems },
            carryForward: {},
        }));
    });

export const page = builder.withInteractive(
    (props, refs, fastViewState: Signals<{ items: Array<{ _id: string; name: string }> }>) => {
        let nextId = 3;
        const [items, setItems] = createSignal(fastViewState.items[0]);

        refs.addButton.onclick(() => {
            setItems([...items(), { _id: String(nextId), name: `Item ${nextId++}` }]);
        });

        return {
            render: () => ({
                items: items(),
            }),
        };
    },
);
