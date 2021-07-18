import basic from './basic-data';
import collections from './collections-data';
import composite from './composite-data';
import conditions from './conditions-data';
import benchmark from './benchmark';
import * as Counter from './counter.comp';

function ex(name: string, render, makeData: () => (index: number) => any) {
    return {name, render, makeData}
}

const examples = [
    ex('simple', basic.render, basic.data),
    ex('collection', collections.render, collections.data),
    ex('composite', composite.render, composite.data),
    ex('conditions', conditions.render, conditions.data)
]

window.onload = function() {
    let target = document.getElementById('target');
    let progress = document.getElementById('progress');
    let chooseExample = document.getElementById('choose-example') as HTMLSelectElement;
    let chooseCycles = document.getElementById('cycles') as HTMLInputElement;

    examples.forEach((example, index) => {
        let option = document.createElement("option");
        option.value = ""+index;
        option.text = example.name;
        chooseExample.appendChild(option);
    })

    chooseExample.addEventListener('change', (event) => {
        let index = Number(chooseExample.value);
        let cycles = Number(chooseCycles.value);
        runExample(examples[index], cycles);
    });

    function runExample(example, cycles) {
        let dataFunc = example.makeData();
        let {dom, update} = example.render(dataFunc(0));
        target.innerHTML = '';
        target.appendChild(dom);

        benchmark(index => update(dataFunc(index)), cycles, status => progress.textContent = status);
    }

//    runExample(examples[0]);

}



