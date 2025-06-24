import { render } from './app.jay-html';
import './index.css';

const items = [
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

const items2 = [
    {
        id: 'i1',
    },
    {
        id: 'i2',
    },
    {
        id: 'i3',
    },
];

// const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
//     type: 'module',
// });

window.onload = function () {
    // setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    const target = document.getElementById('target');

    const [refs, render2] = render();
    const instance = render2({ items, items2 });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
