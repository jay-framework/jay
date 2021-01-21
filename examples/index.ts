import basic from './basic';
import collections from './collections';
import composite from './composite';
import conditions from './conditions';
import benchmark from './benchmark';

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

    examples.forEach((example, index) => {
        let option = document.createElement("option");
        option.value = ""+index;
        option.text = example.name;
        chooseExample.appendChild(option);
    })

    chooseExample.addEventListener('change', (event) => {
        let index = Number(chooseExample.value);
        runExample(examples[index]);
    });

    function runExample(example) {
        let dataFunc = example.makeData();
        let {dom, update} = example.render(dataFunc(0));
        target.innerHTML = '';
        target.appendChild(dom);

        benchmark(index => update(dataFunc(index)), status => progress.textContent = status);
    }

    runExample(examples[0]);

}



