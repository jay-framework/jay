import { CompElementRefs, render as CompRender } from './comp.jay-html';
import { makeJayComponent, Props, createState } from 'jay-component';
import { exec$ } from '../../../../lib';
import { func$, funcGlobal$ } from '../../../../lib';

export interface CompProps {}
function CompConstructor({}: Props<CompProps>, refs: CompElementRefs) {
    let [text, setText] = createState('default result');
    let [items] = createState([
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
        { id: 'c', text: 'gamma' },
    ]);

    refs.buttonExecElement.onclick(async () => {
        let buttonText = await refs.buttonExecElement.exec$(func$('1'));
        setText(`button with text ${buttonText} was clicked`);
    });
    refs.buttonExecGlobal.onclick(async () => {
        let title = await exec$(funcGlobal$('2'));
        setText(`global exec was clicked. document.title: ${title}`);
    });

    refs.itemButtonExecElement.onclick(async ({ viewState: item }) => {
        let buttonText = await refs.itemButtonExecElement
            .find((_) => _.id === item.id)
            .exec$(func$('3'));
        setText(`item button with text ${buttonText} was clicked`);
    });

    return {
        render: () => ({ text, items }),
    };
}

export const Comp = makeJayComponent(CompRender, CompConstructor);
