import { render } from './app.jay-html';
import './index.css';

window.onload = function () {
    let target = document.getElementById('target');
    let app = render({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
