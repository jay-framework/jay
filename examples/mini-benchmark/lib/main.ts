import {createState, makeJayComponent, Props} from 'jay-component';
import {MainRefs, render, SelectedExample} from "./main.jay.html";

interface MainProps {}

const examples = Object.keys(SelectedExample)
    .filter(_ => !isNaN(Number(_)))
    .map(_ => ({value: _, name: SelectedExample[_]}))

function MainConstructor({}: Props<MainProps>, refs: MainRefs) {

    let [selectedExample, setSelectedExample] = createState<SelectedExample>(SelectedExample.basic);
    let [cycles, setCycles] = createState(1000);
    let [progress, setProgress] = createState('');

    refs.chooseExample
        .$onchange(({event}) => (event.target as HTMLSelectElement).selectedIndex)
        .then(({event:index}) => setSelectedExample(Number(examples[index].value)))

    refs.cycles
        .$oninput(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: cycles}) => setCycles(Number(cycles)))

    refs.run.onclick(() => {
        if (selectedExample() === SelectedExample.basic)
            refs.basic.run(setProgress)
        else if (selectedExample() === SelectedExample.collections)
            refs.collections.run(setProgress)
        else if (selectedExample() === SelectedExample.conditions)
            refs.conditions.run(setProgress)
        else if (selectedExample() === SelectedExample.composite)
            refs.composite.run(setProgress)
        else if (selectedExample() === SelectedExample.table)
            refs.table.run(setProgress)
    })

    return {
        render: () => ({examples, selectedExample, cycles, progress})
    }
}

export const Main = makeJayComponent(render, MainConstructor);

