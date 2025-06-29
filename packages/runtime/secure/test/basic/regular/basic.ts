import { BasicElementRefs, render as BasicRender } from './basic.jay-html';
import { makeJayComponent, Props, createMemo } from '@jay-framework/component';

export interface BasicProps {
    firstName: string;
    lastName: string;
}
function BasicConstructor({ firstName, lastName }: Props<BasicProps>, refs: BasicElementRefs) {
    let text = createMemo(() => `hello ${firstName()} ${lastName()}`);

    return {
        render: () => ({ text }),
    };
}

export const Basic = makeJayComponent(BasicRender, BasicConstructor);
