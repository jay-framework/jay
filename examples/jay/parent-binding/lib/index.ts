import { render } from './app.jay-html';
import './index.css';

const initialCards = [
    { id: 'c1', name: 'Design the contract' },
    { id: 'c2', name: 'Write the headless logic' },
    { id: 'c3', name: 'Bind the template' },
];

window.onload = function () {
    const target = document.getElementById('target');

    const [refs, render2] = render();
    const instance = render2({ boardProps: { initialLabel: 'Backlog', initialCards } });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
