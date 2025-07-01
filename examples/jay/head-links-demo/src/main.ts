import { render } from './head-links-demo.jay-html';

window.onload = function () {
    const target = document.getElementById('target');
    const [refs, render2] = render();
    const app = render2({
        title: 'head links example',
        description: 'demonstrating how to dynamically add head links',
    });
    target.innerHTML = '';
    target.appendChild(app.dom);
};
