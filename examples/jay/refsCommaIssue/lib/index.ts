import { render } from './app.jay-html';
import './index.css';

const contractPath = [
    {
        id: 'cp1',
    },
    {
        id: 'cp2',
    },
    {
        id: 'c3',
    },
];

const bindItems = [
    {
        id: 'bi1',
    },
    {
        id: 'bi2',
    },
    {
        id: 'bi3',
    },
];

// const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
//     type: 'module',
// });

window.onload = function () {
    // setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    const target = document.getElementById('target');

    const [refs, render2] = render();
    const instance = render2({ contractPath, bindItems });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
