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
    const instance = render2({ pageTitle: 'Jay Override + Ref Forwarding Demo', cards });

    // The Counter was INJECTED into the card via `<override ref="slot">` in app.jay-html — the card
    // itself has no Counter. Because overrides are compile-time splicing, by the time Phase 3
    // ref-forwarding runs the injected `cta` is indistinguishable from a hardcoded inner ref, so it
    // forwards to the usage site exactly the same way. The event carries the composite's own (Card)
    // viewState — `heading` — with no re-basing to the page scope.
    refs.signupCard.cta.onChange(({ event, viewState }) => {
        write(`[single] "${viewState.heading}" counter → ${event}`);
    });

    // Collection forwarded ref — the composite is repeated under a usage-site forEach, so `cta`
    // becomes a collection. Each injected Counter's event carries that card's viewState.
    refs.cards.cards.cta.onChange(({ event, viewState }) => {
        write(`[list] "${viewState.heading}" counter → ${event}`);
    });

    // find(pred) reaches exactly one injected card in the collection by its viewState.
    const bravoCta = refs.cards.cards.cta.find((vs) => vs.heading === 'Bravo');
    if (bravoCta)
        bravoCta.onChange(({ event }) => write(`[find:Bravo only] counter → ${event}`));

    target.innerHTML = '';
    target.appendChild(instance.dom);
};
