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
    // itself has no Counter. DL#193 §C / Phase 3: because the override author writes against the OUTER
    // (page) scope and does NOT know the card's internal ViewState, the injected `cta`'s forwarded ref
    // re-bases to that outer scope — for onChange AND find/map alike. For the single card the outer
    // scope is the page (AppViewState), so the event carries `pageTitle`, not the card's `heading`.
    refs.signupCard.cta.onChange(({ event, viewState }) => {
        write(`[single] "${viewState.pageTitle}" counter → ${event}`);
    });

    // Collection forwarded ref — the composite is repeated under a usage-site forEach, so `cta`
    // becomes a collection. The override's outer scope here is the forEach item (CardOfAppViewState),
    // so each injected Counter's event carries that item — `label`, not the card's `heading`.
    refs.cards.cards.cta.onChange(({ event, viewState }) => {
        write(`[list - override] "${viewState.label}" counter → ${event}`);
    });

    refs.cards.cards.cardCounter.onChange(({ event, viewState }) => {
        write(`[list - internal] "${viewState}" counter → ${event}`);
    })

    // find(pred) reaches exactly one injected card in the collection by its OUTER-scope viewState.
    const bravoCta = refs.cards.cards.cta.find((vs) => vs.label === 'Bravo');
    if (bravoCta)
        bravoCta.onChange(({ event }) => write(`[find:Bravo only] counter → ${event}`));

    target.innerHTML = '';
    target.appendChild(instance.dom);
};
