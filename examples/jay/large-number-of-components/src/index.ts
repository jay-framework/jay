//import 'jay-reactive/tracing'
import { render } from './app.jay-html';
import './index.css';

window.onload = function () {
    const target = document.getElementById('target');
    const [refs, render2] = render();
    const app = render2({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
