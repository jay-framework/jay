import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    HeadlessComponentContract,
    HeadlessComponentRefs,
    HeadlessComponentSlowViewState,
    HeadlessComponentFastViewState,
} from './headless-component.jay-contract';

const builder = makeJayStackComponent<HeadlessComponentContract>()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput<HeadlessComponentSlowViewState>(
            { label: 'Keyed Headless' },
            {},
        ),
    )
    .withFastRender(async () =>
        phaseOutput<HeadlessComponentFastViewState>(
            { count: 10 },
            {},
        ),
    );

export const headless = builder.withInteractive(
    (
        _props,
        refs: HeadlessComponentRefs,
        fastViewState: Signals<HeadlessComponentFastViewState>,
    ) => {
        const [count, setCount] = fastViewState.count;

        refs.increment.onclick(() => {
            setCount(count() + 1);
        });

        return {
            render: () => ({
                count: count(),
            }),
        };
    },
);
