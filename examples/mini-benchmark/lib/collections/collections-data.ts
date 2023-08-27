import {CollectionsElementRefs, render} from './collections.jay.html';
import {createMemo, createState, makeJayComponent, Props, useReactive} from 'jay-component';
import benchmark from "../benchmark";
import {ADD, JSONPatch, MOVE, REMOVE, REPLACE} from "jay-json-patch";
import {patch} from "jay-json-patch";

interface CollectionsProps {
    cycles: number
}

function CollectionsConstructor({cycles}: Props<CollectionsProps>, refs: CollectionsElementRefs) {
    let [title] = createState('collection');
    let reactive = useReactive();
    let [items, setItems] = createState([
        {name: 'car', completed: false, cost: 10, id: 'a'},
        {name: 'plane', completed: true, cost: 100, id: 'b'},
        {name: 'boat', completed: false, cost: 50, id: 'c'}
    ]);
    let numberOfItems = createMemo(() => items().length)

    let nextId = 0;
    const updateCollection = (index) => {
        let jsonPatch: JSONPatch = [];
        let lengthOffset = 0;
        if (index % 2 === 0) {
            let index = Math.floor(items().length * Math.random());
            jsonPatch.push({op: REPLACE, path: [index, 'cost'], value: items()[index].cost + 1000})
        }
        if (index % 3 === 0) {
            jsonPatch.push({op: ADD, path: [items().length + 1],
                value: {name: 'item ' + nextId++, completed: !!(index % 2), cost: index, id: 'a' + nextId++}
            })
            lengthOffset += 1;
        }
        if (index % 5 === 0) {
            let rand = Math.floor(Math.random() * items().length + lengthOffset);
            jsonPatch.push({op: REMOVE, path: [rand]})
            lengthOffset -= 1;
        }
        if (index % 7 === 0) {
            let rand = Math.floor(Math.random() * items().length + lengthOffset);
            let rand2 = Math.floor(Math.random() * items().length + lengthOffset);
            jsonPatch.push({op: MOVE, path: [rand2], from: [rand]})
        }
        setItems(patch(items(), jsonPatch))
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