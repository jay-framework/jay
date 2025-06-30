import { BasicElementRefs, render as BasicRender } from './basic.jay-html';
import { createSignal, makeJayComponent, useReactive, Props } from '@jay-framework/component';
import benchmark from '../benchmark';

interface BasicProps {
    cycles: number;
}
function BasicConstructor({ cycles }: Props<BasicProps>, refs: BasicElementRefs) {
    let [text, setText] = createSignal('name');
    let reactive = useReactive();

    const run = (progressCallback: (string) => void) => {
        benchmark(
            (index) => reactive.batchReactions(() => setText('name ' + index)),
            cycles(),
            progressCallback,
        );
    };
    return {
        render: () => ({ text }),
        run,
    };
}

export const Basic = makeJayComponent(BasicRender, BasicConstructor);
