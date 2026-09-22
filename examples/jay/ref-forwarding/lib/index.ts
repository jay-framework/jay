import { render } from './app.jay-html';
import './index.css';

const cards = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo' },
    { id: 'c', label: 'Charlie' },
];

window.onload = function () {
    const target = document.getElementById('target');
    const log = document.getElementById('log');
    const write = (line: string) => {
        if (log) log.textContent = `${line}\n${log.textContent ?? ''}`;
    };

    const [refs, render2] = render();
    const instance = render2({ pageTitle: 'Jay Ref Forwarding Demo', cards });

    // DL#194 — single forwarded ref. `signupCard` is a pure (Tier 2) composite that is *inlined* into
    // the page: there is no component boundary, so `cta` (its inner Counter ref) is parent-owned and its
    // event carries the *external* (page) viewState — `pageTitle` — not the card's own `heading`.
    refs.signupCard.cta.onChange(({ event, viewState }) => {
        write(`[single] "${viewState.pageTitle}" counter → ${event}`);
    });

    // Collection forwarded ref — the composite is repeated under a usage-site forEach, so `cta`
    // becomes a collection. onChange fans to every card, each event carrying that card's external
    // (forEach-item) viewState — `label`.
    refs.cards.cards.cta.onChange(({ event, viewState }) => {
        write(`[list] "${viewState.label}" counter → ${event}`);
    });

    // find(pred) reaches exactly one card in the collection by its external viewState.
    const bravoCta = refs.cards.cards.cta.find((vs) => vs.label === 'Bravo');
    if (bravoCta) bravoCta.onChange(({ event }) => write(`[find:Bravo only] counter → ${event}`));

    target.innerHTML = '';
    target.appendChild(instance.dom);
};
