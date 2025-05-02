import {
    render,
    SvgComponentElementRefs,
    ShapeOfSvgComponentViewState,
} from './svg-component.jay-html';
import { createMemo, createSignal, makeJayComponent, Props } from 'jay-component';

export interface SvgComponentProps {}

const colors = ['red', 'blue', 'green', 'yellow', 'black'];
function SvgComponentConstructor({}: Props<SvgComponentProps>, refs: SvgComponentElementRefs) {
    const [shape, setShape] = createSignal(ShapeOfSvgComponentViewState.circle);
    const [colorIndex, setColorIndex] = createSignal(0);
    const color = createMemo(() => colors[colorIndex() % colors.length]);
    const [clickMessage, setClickMessage] = createSignal('Click me!');

    function doClick() {
        shape() === ShapeOfSvgComponentViewState.circle
            ? setShape(ShapeOfSvgComponentViewState.square)
            : setShape(ShapeOfSvgComponentViewState.circle);
        setColorIndex((_) => _ + 1);
        if (colorIndex() === 1) setClickMessage('click me\nagain!');
        else setClickMessage(`click\nanother\ntime`);
    }

    refs.shape.onclick(doClick);
    refs.message.onclick(doClick);

    return {
        render: () => ({ shape, color, clickMessage }),
    };
}

export const SvgComponent = makeJayComponent(render, SvgComponentConstructor);
