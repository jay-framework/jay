import { render } from './counter.jay.html';

function Counter(initialValue: number) {
    let jayElement = render({ count: initialValue });
    let count = initialValue;

    jayElement.refs.adder.onclick(() => {
        count += 1;
        jayElement.update({ count });
    });

    jayElement.refs.subtracter.onclick(() => {
        count -= 1;
        jayElement.update({ count });
    });

    return {
        element: jayElement,
        update: () => {},
    };
}

export default function run(target) {
    let counter = Counter(12);
    target.innerHTML = '';
    target.appendChild(counter.element.dom);
}
