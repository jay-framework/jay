/**
 * Coded (headless) component (DL#196): its .ts makes <jay:button> a real component boundary.
 * Used as the innermost element of the nested-composition page (button in card in section).
 */
import { type Props } from '@jay-framework/component';
import { makeJayStackComponent, phaseOutput } from '@jay-framework/fullstack-component';
import {
    type ButtonContract,
    type ButtonProps,
    type ButtonRefs,
    type ButtonSlowViewState,
} from './button.jay-contract';

export const button = makeJayStackComponent<ButtonContract>()
    .withProps<ButtonProps>()
    .withSlowlyRender(async (props: ButtonProps) => {
        console.log('***********', props);
        return phaseOutput<ButtonSlowViewState, {}>({ label: props.label }, {});
    })
    .withInteractive((_props: Props<ButtonProps>, refs: ButtonRefs) => {
        const { label } = _props;
        refs.clickAction.onclick(({ viewState }) => console.log('nested button clicked', label()));
        return {
            render: () => ({ label }),
        };
    });
