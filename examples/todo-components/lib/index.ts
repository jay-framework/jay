import { render } from './app.jay-html';
import './index.css';

const initialTodos = [
    {
        id: 'a1',
        title: 'a title 1',
        isCompleted: false,
    },
    {
        id: 'a2',
        title: 'a title 2',
        isCompleted: false,
    },
    {
        id: 'a3',
        title: 'a title 3',
        isCompleted: true,
    },
];

window.onload = function () {
    let target = document.getElementById('target');

    let instance = render({ todoProps: {initialTodos} });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
