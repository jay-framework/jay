import { makeJayComponent, Props } from '../../lib';
import { LabelAndButtonRefs, renderLabelElement } from './label-and-button-element';
import { COUNT_CONTEXT, CountContext } from './number-context';

export interface CompProps {}
export function LabelAndButtonComponent(
    {}: Props<CompProps>,
    refs: LabelAndButtonRefs,
    { count, inc }: CountContext,
) {
    refs.button.onclick(() => inc());
    return {
        render: () => ({
            label: () => `the count is ${count()}`,
        }),
    };
}
export const LabelAndButtonComp = makeJayComponent(
    renderLabelElement,
    LabelAndButtonComponent,
    COUNT_CONTEXT,
);
