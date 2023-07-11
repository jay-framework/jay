import {render, CollectionsElementRefs} from './collections.jay.html';
import {createState, makeJayComponent, useReactive, Props, createMemo, createMutableState} from 'jay-component';
import benchmark from "../benchmark";
import {mutableObject} from 'jay-mutable';

interface CollectionsProps {
    cycles: number
}

function CollectionsConstructor({cycles}: Props<CollectionsProps>, refs: CollectionsElementRefs) {
    let [title] = createState('collection');
    let reactive = useReactive();
    let items = createMutableState([
        {name: 'car', completed: false, cost: 10, id: 'a'},
        {name: 'plane', completed: true, cost: 100, id: 'b'},
        {name: 'boat', completed: false, cost: 50, id: 'c'}
    ]);
    let numberOfItems = createMemo(() => items().length)

    let nextId = 0;
    const updateCollection = (index) => {
        if (index % 2 === 0) {
            let index = Math.floor(items().length * Math.random());
            items()[index].cost += 1000;
        }
        if (index % 3 === 0)
            items().push({name: 'item ' + nextId++, completed: !!(index % 2), cost: index, id: 'a' + nextId++});
        if (index % 5 === 0) {
            let rand = Math.floor(Math.random() * items().length);
            items().splice(rand, 1);
        }
        if (index % 7 === 0) {
            let rand = Math.floor(Math.random() * items().length);
            let rand2 = Math.floor(Math.random() * items().length);
            let item = items().splice(rand, 1);
            items().splice(rand2, 0, item[0]);
        }
    }


    const run = (progressCallback: (string) => void) => {
        benchmark(index => reactive.batchReactions(() => updateCollection(index)), cycles(), progressCallback);
    }
    return {
        render: () => ({title, items, numberOfItems}),
        run
    }
}

export const Collections = makeJayComponent(render, CollectionsConstructor);