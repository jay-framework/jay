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

    // DL#193 Phase 3 — single forwarded ref. `signupCard` is a pure (Tier 2) composite; `cta` is its
    // inner Counter ref, forwarded to the usage site. The event carries the composite's own
    // (Card) viewState — `heading` — with no re-basing to the page scope.
    refs.signupCard.cta.onChange(({ event, viewState }) => {
        write(`[single] "${viewState.heading}" counter → ${event}`);
    });

    // Collection forwarded ref — the composite is repeated under a usage-site forEach, so `cta`
    // becomes a collection. onChange fans to every card, each event carrying that card's viewState.
    refs.cards.cards.cta.onChange(({ event, viewState }) => {
        write(`[list] "${viewState.heading}" counter → ${event}`);
    });

    // find(pred) reaches exactly one card in the collection by its viewState.
    const bravoCta = refs.cards.cards.cta.find((vs) => vs.heading === 'Bravo');
    if (bravoCta)
        bravoCta.onChange(({ event }) => write(`[find:Bravo only] counter → ${event}`));

    target.innerHTML = '';
    target.appendChild(instance.dom);
};
