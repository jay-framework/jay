import { Main } from './main';

window.onload = function () {
    let target = document.getElementById('target');
    let main = Main({});
    target.appendChild(main.element.dom);
};
