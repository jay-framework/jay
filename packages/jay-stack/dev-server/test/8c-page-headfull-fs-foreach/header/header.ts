import {
    makeJayStackComponent,
    RenderPipeline,
    type Signals,
} from '@jay-framework/fullstack-component';
import { type Props } from '@jay-framework/component';
import type {
    HeaderContract,
    HeaderProps,
    HeaderRefs,
    HeaderFastViewState,
} from './header.jay-contract';

// Fast-only header (no slow phase) — safe for use inside forEach
const builder = makeJayStackComponent<HeaderContract>()
    .withProps<HeaderProps>()
    .withFastRender(async (props: HeaderProps) => {
        const Pipeline = RenderPipeline.for<HeaderFastViewState, {}>();
        return Pipeline.ok({}).toPhaseOutput(() => ({
            viewState: {
                label: `Item ${props.itemId}`,
                value: parseInt(props.itemId) * 10 || 0,
            },
            carryForward: {},
        }));
    })
    .withClientDefaults((props: HeaderProps) => ({
        viewState: {
            label: `Item ${props.itemId}`,
            value: parseInt(props.itemId) * 10 || 0,
        },
        carryForward: {},
    }));

export const header = builder.withInteractive(
    (
        props: Props<HeaderProps>,
        refs: HeaderRefs,
        fastViewState: Signals<HeaderFastViewState>,
        carryForward: {},
    ) => {
        const [value, setValue] = fastViewState.value;

        refs.increment.onclick(() => {
            setValue(value() + 1);
        });

        return {
            render: () => ({
                label: `Item ${props.itemId()}`,
                value: value(),
            }),
        };
    },
);
