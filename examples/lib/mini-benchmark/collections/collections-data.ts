import {render, CollectionsViewState} from './collections.jay.html';
import benchmark from "../benchmark";
import {mutableObject} from 'jay-reactive';

export default function run(target, cycles, progressCallback) {
    let dataFunc = data();
    let {dom, update} = render(dataFunc(0));
    target.innerHTML = '';
    target.appendChild(dom);

    benchmark(index => update(dataFunc(index)), cycles, progressCallback);
}

function data() {
    let title = 'todo';
    let items = mutableObject([
        {name: 'car', completed: false, cost: 10, id: 'a'},
        {name: 'plane', completed: true, cost: 100, id: 'b'},
        {name: 'boat', completed: false, cost: 50, id: 'c'}
    ]);
    return function (index): CollectionsViewState {
        if (index === 0)
            return {title, items};
        else {
            if (index % 2 === 0) {
                let index = Math.floor(items.length * Math.random());
                items[index].cost += 1000;
            }
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