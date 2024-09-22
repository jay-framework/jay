import { render } from './app.jay-html';
import { JayPort, setMainPort, HandshakeMessageJayChannel } from 'jay-secure';
import './index.css';

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    let target = document.getElementById('target');
    const [refs, render2] = render();
    let app = render2({});
    target.innerHTML = '';
    target.appendChild(app.dom);
};
