import { render } from './app.jay-html';
import { JayPort, setMainPort } from 'jay-secure';
import { HandshakeMessageJayChannel } from 'jay-secure';

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

const jayWorker = new Worker('./worker.js');

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    let app = render({ todos: { initialTodos } });
    target.innerHTML = '';
    target.appendChild(app.dom);
};
