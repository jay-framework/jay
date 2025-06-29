import { JayPort, setMainPort, HandshakeMessageJayChannel } from '@jay-framework/secure';
import { render } from './app.jay-html';

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));
    const target = document.getElementById('target');
    const [refs, render2] = render();
    const app = render2({ incrementBy: 2 });
    target.innerHTML = '';
    target.appendChild(app.dom);
};
