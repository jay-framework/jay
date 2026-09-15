import { render } from './app.jay-html';
import './index.css';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from '@jay-framework/secure';

const initialCards = [
    { id: 'c1', name: 'Design the contract' },
    { id: 'c2', name: 'Write the headless logic' },
    { id: 'c3', name: 'Bind the template' },
];

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    const target = document.getElementById('target');

    const [refs, render2] = render();
    const instance = render2({ boardProps: { initialLabel: 'Backlog', initialCards } });
    target.innerHTML = '';
    target.appendChild(instance.dom);
};
