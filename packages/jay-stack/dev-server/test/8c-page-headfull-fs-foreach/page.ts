import {
    makeJayStackComponent,
    phaseOutput,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { createSignal } from '@jay-framework/component';

const initialItems = [
    { _id: '1', name: 'Item 1' },
    { _id: '2', name: 'Item 2' },
    { _id: '3', name: 'Item 3' },
];

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () => phaseOutput({ title: 'ForEach Headfull FS' }, {}))
    .withFastRender(async () => {
        const Pipeline = RenderPipeline.for();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: { items: initialItems },
            carryForward: {},
        }));
    });

export const page = builder.withInteractive(
    (props, refs, fastViewState: Signals<{ items: Array<{ _id: string; name: string }> }>) => {
        let nextId = 4;
        const [items, setItems] = createSignal(fastViewState.items[0]);

        refs.addButton.onclick(() => {
            setItems([...items(), { _id: String(nextId), name: `Item ${nextId++}` }]);
        });

        refs.removeButton.onclick(() => {
            const current = items();
            if (current.length > 0) {
                setItems(current.slice(0, -1));
            }
        });

        return {
            render: () => ({
                items: items(),
            }),
        };
    },
);
