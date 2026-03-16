import { makeJayStackComponent } from '@jay-framework/fullstack-component';
import { createSignal } from '@jay-framework/component';

// No withSlowlyRender, no withFastRender — interactive only
export const page = makeJayStackComponent()
    .withProps<{}>()
    .withInteractive((props, refs) => {
        const [count, setCount] = createSignal(0);

        refs.incrementButton.onclick(() => {
            setCount(count() + 1);
        });

        return {
            render: () => ({
                title: 'Interactive Only',
                count: count(),
            }),
        };
    });
