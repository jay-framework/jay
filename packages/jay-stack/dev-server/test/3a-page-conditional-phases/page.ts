import {
    makeJayStackComponent,
    phaseOutput,
    type Signals,
} from '@jay-framework/fullstack-component';

const builder = makeJayStackComponent()
    .withProps<{}>()
    .withSlowlyRender(async () =>
        phaseOutput(
            { title: 'Phase Conditionals', slowVisible: true, slowHidden: false },
            {},
        ),
    )
    .withFastRender(async () =>
        phaseOutput(
            { fastVisible: true, fastHidden: false, interactiveVisible: true, interactiveHidden: false },
            {},
        ),
    );

export const page = builder.withInteractive(
    (
        props,
        refs: { toggleButton: { onclick: (fn: () => void) => void } },
        fastViewState: Signals<{ interactiveVisible: boolean; interactiveHidden: boolean }>,
    ) => {
        const [interactiveVisible, setInteractiveVisible] = fastViewState.interactiveVisible;
        const [interactiveHidden, setInteractiveHidden] = fastViewState.interactiveHidden

        refs.toggleButton.onclick(() => {
            setInteractiveVisible(!interactiveVisible());
            setInteractiveHidden(!interactiveHidden());
        });

        return {
            render: () => ({
                interactiveVisible: interactiveVisible(),
                interactiveHidden: interactiveHidden(),
            }),
        };
    },
);
