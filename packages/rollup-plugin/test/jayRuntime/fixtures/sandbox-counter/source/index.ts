import { render } from './app.jay-html';

window.onload = function () {
    let target = document.getElementById('target');
    let app = render({ incrementBy: 2 });
    target.innerHTML = '';
    target.appendChild(app.dom);
};
