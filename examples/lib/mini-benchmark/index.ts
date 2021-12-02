import basic from './basic/basic-data';
import collections from './collections/collections-data';
import composite from './composite/composite-data';
import conditions from './conditions/conditions-data';
import table from './table/table-component';

function ex(name: string, run: (target, cycles, progressCallback) => void) {
    return {name, run}
}

const examples = [
    ex('simple', basic),
    ex('collection', collections),
    ex('composite', composite),
    ex('conditions', conditions),
    ex('table', table),

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
        examples[index].run(target, cycles, status => progress.textContent = status);
    });

}



