import { render } from './app.jay-html';
import './index.css';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from 'jay-secure';

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

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');

    let instance = render({ todoProps: { initialTodos } });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
