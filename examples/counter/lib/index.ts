import { render } from './app.jay.html';

window.onload = function () {
    let target = document.getElementById('target');
    let app = render({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
