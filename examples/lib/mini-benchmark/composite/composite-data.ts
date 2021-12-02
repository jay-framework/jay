import {render} from './composite.jay.html';
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
            return {text: 'name', text2: 'text 2'}
        else
            return {text: 'name ' + index, text2: 'text 2 ' + index}
    }
}

