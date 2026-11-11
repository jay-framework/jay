import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';
import type {
    HeadlessComponentContract,
    HeadlessComponentRefs,
    HeadlessComponentFastViewState,
} from './headless-component.jay-contract';

const builder = makeJayStackComponent<HeadlessComponentContract>()
    .withProps<{}>()
    .withFastRender(async () =>
        phaseOutput<HeadlessComponentFastViewState>(
            { message: 'idle', isActive: false, invalid: false },
            {},
        ),
    );

export const headless = builder.withInteractive(
    (
        _props,
        refs: HeadlessComponentRefs,
        fastViewState: Signals<HeadlessComponentFastViewState>,
    ) => {
        const [isActive, setIsActive] = fastViewState.isActive;

        refs.toggle.onclick(() => setIsActive(!isActive()));

        return {
            render: () => ({
                message: isActive() ? 'active' : 'idle',
                isActive: isActive(),
                invalid: isActive(),
            }),
        };
    },
);
