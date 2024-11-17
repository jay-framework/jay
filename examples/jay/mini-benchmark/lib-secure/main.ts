import { createSignal, makeJayComponent, Props } from 'jay-component';
import { MainElementRefs, render, SelectedExample } from './main.jay-html';
import { JayEvent } from 'jay-runtime';
import { MainViewState } from '../lib/main.jay-html';

export interface MainProps {}

const examples = Object.keys(SelectedExample)
    .filter((_) => !isNaN(Number(_)))
    .map((_) => ({ value: _, name: SelectedExample[_] }));

function MainConstructor({}: Props<MainProps>, refs: MainElementRefs) {
    let [selectedExample, setSelectedExample] = createSignal<SelectedExample>(
        SelectedExample.basic,
    );
    let [cycles, setCycles] = createSignal(1000);
    let [progress, setProgress] = createSignal('');

    refs.chooseExample.onchange(({ event }: JayEvent<Event, MainViewState>) => {
        const index = (event.target as HTMLSelectElement).selectedIndex;
        setSelectedExample(Number(examples[index].value));
    });

    refs.cycles.oninput(({ event }: JayEvent<Event, MainViewState>) => {
        const cycles = (event.target as HTMLInputElement).value;
        setCycles(Number(cycles));
    });

    refs.run.onclick(() => {
        if (selectedExample() === SelectedExample.basic) refs.basic.run(setProgress);
        else if (selectedExample() === SelectedExample.collections)
            refs.collections.run(setProgress);
        else if (selectedExample() === SelectedExample.conditions) refs.conditions.run(setProgress);
        else if (selectedExample() === SelectedExample.composite) refs.composite.run(setProgress);
        else if (selectedExample() === SelectedExample.table) refs.table.run(setProgress);
    });

    return {
        render: () => ({ examples, selectedExample, cycles, progress }),
    };
}

export const Main = makeJayComponent(render, MainConstructor);
