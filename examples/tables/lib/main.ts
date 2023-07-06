import {createState, makeJayComponent, Props} from 'jay-component';
import {MainElementRefs, render, SelectedExample} from "./main.jay.html";

interface MainProps {}

const examples = Object.keys(SelectedExample)
    .filter(_ => !isNaN(Number(_)))
    .map(_ => ({value: _, name: SelectedExample[_]}))

function MainConstructor({}: Props<MainProps>, refs: MainElementRefs) {

    let [selectedExample, setSelectedExample] = createState<SelectedExample>(SelectedExample.mutable);
    let [cycles, setCycles] = createState(1000);
    let [progress, setProgress] = createState('');

    refs.chooseExample
        .$onchange(({event}) => (event.target as HTMLSelectElement).selectedIndex)
        .then(({event:index}) => setSelectedExample(Number(examples[index].value)))

    refs.cycles
        .$oninput(({event}) => (event.target as HTMLInputElement).value)
        .then(({event: cycles}) => setCycles(Number(cycles)))

    refs.run.onclick(() => {
        if (selectedExample() === SelectedExample.mutable)
            refs.tableMutable.run(setProgress)
        else if (selectedExample() === SelectedExample.immutable)
            refs.tableImmutable.run(setProgress)
        else if (selectedExample() === SelectedExample.immer)
            refs.tableImmer.run(setProgress)
        else if (selectedExample() === SelectedExample.fixedMutable)
            refs.tableFixedMutable.run(setProgress)
        else if (selectedExample() === SelectedExample.fixedImmutable)
            refs.tableFixedImmutable.run(setProgress)
        else if (selectedExample() === SelectedExample.fixedImmer)
            refs.tableFixedImmer.run(setProgress)
    })

    return {
        render: () => ({examples, selectedExample, cycles, progress})
    }
}

export const Main = makeJayComponent(render, MainConstructor);

