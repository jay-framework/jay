import { render } from './app.jay-html';
import './index.css';

window.onload = function () {
    let target = document.getElementById('target');
    const [refs, render2] = render();
    let app = render2({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
