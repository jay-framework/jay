import { Main } from './main';
import './index.css';

window.onload = function () {
    let target = document.getElementById('target');
    let main = Main({});
    target.appendChild(main.element.dom);
};
