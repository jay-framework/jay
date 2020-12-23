import render from './output2';
import benchmark from '../benchmark';

window.onload = function() {
    let target = document.getElementById('target');
    let progress = document.getElementById('progress');
    let {dom, update} = render({text: 'name'});
    target.appendChild(dom);

    benchmark(index => update({text: 'name ' + index}), status => progress.textContent = status);
}