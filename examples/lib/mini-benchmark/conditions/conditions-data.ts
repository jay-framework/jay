import {render} from './conditions.jay.html';
import benchmark from "../benchmark";

export default function run(target, cycles, progressCallback) {
    let dataFunc = data();
    let {dom, update} = render(dataFunc(0));
    target.innerHTML = '';
    target.appendChild(dom);

    benchmark(index => update(dataFunc(index)), cycles, progressCallback);
}

function data() {
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

