import { render } from './app.jay-html';
import './index.css';
import { HandshakeMessageJayChannel, JayPort, setMainPort } from '@jay-framework/secure';

const cards = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo' },
    { id: 'c', label: 'Charlie' },
];

const jayWorker = new Worker(new URL('jay-sandbox:./sandbox-root', import.meta.url), {
    type: 'module',
});

window.onload = function () {
    setMainPort(new JayPort(new HandshakeMessageJayChannel(jayWorker)));

    const target = document.getElementById('target');
    const log = document.getElementById('log');
    const write = (line: string) => {
        if (log) log.textContent = `${line}\n${log.textContent ?? ''}`;
    };

    const [refs, render2] = render();
    const instance = render2({ pageTitle: 'Jay Ref Forwarding Demo (secure)', cards });

    // Same forwarded-ref wiring as the regular build — the secure-mode acceptance gate for DL#193
    // Phase 3: the forwarded `cta` reaches the sandboxed counter identically.
    refs.signupCard.cta.onChange(({ event, viewState }) => {
        write(`[single] "${viewState.heading}" counter → ${event}`);
    });

    refs.cards.cards.cta.onChange(({ event, viewState }) => {
        write(`[list] "${viewState.heading}" counter → ${event}`);
    });

    const bravoCta = refs.cards.cards.cta.find((vs) => vs.heading === 'Bravo');
    if (bravoCta)
        bravoCta.onChange(({ event }) => write(`[find:Bravo only] counter → ${event}`));

    target.innerHTML = '';
    target.appendChild(instance.dom);
};
