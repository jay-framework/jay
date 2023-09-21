import { Counter } from './counter';

window.onload = function () {
    let target = document.getElementById('target');
    let counter = Counter({ initialValue: 12 });
    target.innerHTML = '';
    target.appendChild(counter.element.dom);
};
