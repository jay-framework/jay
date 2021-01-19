import render from './output';
import benchmark from '../benchmark';

window.onload = function() {
    let target = document.getElementById('target');
    let progress = document.getElementById('progress');
    let {dom, update} = render({text: 'name', text2: 'text 2'});
    target.appendChild(dom);

    benchmark(
        index => update({text: 'name ' + index, text2: 'text 2 ' + index}),
        status => progress.textContent = status);
}