import { produce, enablePatches, enableMapSet } from 'immer';
enablePatches();
enableMapSet();

const tableSize = 100;
let tableLines = [];
for (let x = 0; x < tableSize; x++) {
    tableLines[x] = { id: x, cell: [] };
    for (let y = 0; y < tableSize; y++) {
        tableLines[x].cell[y] = { id: y, value: Math.round(Math.random() * 100) };
    }
}

console.log(tableLines);

const REVNUM = 'revnum';
const ARRAY = 'array';
function replacer(key: string, value: any) {
    if (typeof value === 'object') {
        let revisioned = 4;
        let newValue = { ...value };
        newValue[REVNUM] = revisioned;
        if (Array.isArray(value)) {
            newValue[ARRAY] = true;
        }
        return newValue;
    } else return value;
}

function _serialize(entity, res) {
    let type = typeof entity;
    if (type === 'object') {
        if (Array.isArray(entity)) {
            res.push('[');
            for (let prop of Object.keys(entity)) {
                _serialize(entity[prop], res);
                res.push(',');
            }
            res.push(']');
        } else {
            res.push('{');
            for (let prop of Object.keys(entity)) {
                res.push(prop);
                res.push(':');
                _serialize(entity[prop], res);
                res.push('}');
            }
        }
    } else res.push(entity);
}
function serialize(entity) {
    let res = [];
    _serialize(entity, res);
    console.timeLog('custom serialize');
    return JSON.stringify(res);
}

// for (let i=0; i < 20; i++) {
//     console.time('serialize')
//     let x = JSON.stringify(tableLines)
//     console.timeEnd('serialize')
// }
//
// for (let i=0; i < 20; i++) {
//     console.time('serialize-with-replacer')
//     let x = JSON.stringify(tableLines, replacer)
//     console.timeEnd('serialize-with-replacer')
// }
//
// for (let i=0; i < 20; i++) {
//     console.time('custom serialize')
//     let x = serialize(tableLines);
//     console.timeEnd('custom serialize')
//     console.log(x)
// }
//

for (let i = 0; i < 20; i++) {
    tableLines = produce(
        tableLines,
        (draftState) => {
            for (let i = 0; i < 100; i++) {
                let x = Math.round(Math.random() * 99);
                let y = Math.round(Math.random() * 99);
                draftState[x].cell[y].value = Math.round(Math.random() * 100);
            }
        },
        (patches, inversePatches) => {
            console.time('immer mutate');
            let x = JSON.stringify(patches);
            console.timeEnd('immer mutate');
            console.log(x);
        },
    );
}

const baseState = [
    { title: 'Learn TypeScript', done: true },
    { title: 'Try Immer', done: false },
    { title: 'item 3', done: false },
    { title: 'item 4', done: false },
    { title: 'item 5', done: false },
    { title: 'item 6', done: false },
];

for (let i = 0; i < 100; i++) baseState.push({ title: 'item 6' + i, done: false });

console.time('x');
const nextState = produce(
    baseState,
    (draftState) => {
        draftState.push({ title: 'Tweet about it', done: false });
        draftState[1].done = true;
        // draftState.splice(3, 2)
        draftState.splice(1, 0, { title: 'item 7', done: true }, { title: 'item 8', done: true });
    },
    (patches, inversePatches) => {
        console.log(patches);
    },
);
console.timeEnd('x');

console.log(baseState === nextState);
console.log(baseState[1] === nextState[1]);
console.log(baseState[0] === nextState[0]);

// const baseStateMap = new Map();
// baseStateMap.set('a', {title: "Learn TypeScript", done: true})
// baseStateMap.set('b', {title: "Try Immer", done: false})
// baseStateMap.set('c', {title: "item 3", done: false})
// baseStateMap.set('d', {title: "item 4", done: false})
// baseStateMap.set('e', {title: "item 5", done: false})
// baseStateMap.set('f', {title: "item 6", done: false})
//
// for (let i=0; i < 100; i++)
//     baseStateMap.set('g'+i, {title: "item 6" + i, done: false})
//
// console.time('x')
// const nextStateMap = produce(baseStateMap, draftStateMap => {
//     draftStateMap.set('z', {title: "Tweet about it", done: false})
//     draftStateMap.get('b').done = true
//     // draftState.splice(3, 2)
//     draftStateMap.delete('c')
// }, (patches, inversePatches) => {
//     console.log(patches)
// })
// console.timeEnd('x')
//
//
