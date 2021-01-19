import renderBasic from './basic/output';
import renderCollections from './collections/output';
import renderComposite from './composite/output';
import renderConditions from './conditions/output';
import benchmark from './benchmark';

function ex(name: string, render, makeData: () => (index: number) => any) {
    return {name, render, makeData}
}

const examples = [
    ex('simple', renderBasic, basicData),
    ex('collection', renderCollections, collectionData),
    ex('composite', renderComposite, compositeData),
    ex('conditions', renderConditions, conditionsData)
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
        target.appendChild(dom);

        benchmark(index => update(dataFunc(index)), status => progress.textContent = status);
    }

    runExample(examples[0]);

}


function basicData() {
    return function (index) {
        if (index === 0)
            return {text: 'name'};
        else
            return {text: 'name ' + index};
    }
}

function conditionsData() {
    return function (index) {
        if (index === 0)
            return {text1: 'name', text2: 'name2', cond: true}
        else
            return {
                text1: 'name ' + index,
                text2: 'name ' + index * 2,
                cond: index % 2 === 0
            }
    }
}

function compositeData() {
    return function (index) {
        if (index === 0)
            return {text: 'name', text2: 'text 2'}
        else
        return {text: 'name ' + index, text2: 'text 2 ' + index}
    }
}

function collectionData() {
    let title = 'todo';
    let items = [
        {name: 'car', completed: false, cost: 10, id: 'a'},
        {name: 'plane', completed: true, cost: 100, id: 'b'},
        {name: 'boat', completed: false, cost: 50, id: 'c'}
    ];
    return function (index) {
        if (index === 0)
            return {title, items};
        else {
            items = [...items];
            if (index % 3 === 0)
                items.push({name: 'item ' + index, completed: !!(index % 2), cost: index, id: 'a' + index});
            if (index % 5 === 0) {
                let rand = Math.floor(Math.random() * items.length);
                items.splice(rand, 1);
            }
            if (index % 7 === 0) {
                let rand = Math.floor(Math.random() * items.length);
                let rand2 = Math.floor(Math.random() * items.length);
                let item = items.splice(rand, 1);
                items.splice(rand2, 0, item[0]);
            }
            return {title, items}
        }
    }
}