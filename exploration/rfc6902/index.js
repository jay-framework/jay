const {applyPatch, createPatch} = require('rfc6902')

console.log(1)

const tableSize = 100;
const numCellsToUpdate = 100;
let tableLines = []
for (let x = 0; x < tableSize; x++) {
    tableLines[x] = {id: x, cell: []};
    for (let y = 0; y < tableSize; y++) {
        tableLines[x].cell[y] = {id: y, value: Math.round(Math.random()*100)};
    }
}
console.log(2)
const makeUpdate = (original) => {
    let copy = []
    for (let x = 0; x < tableSize; x++) {
        copy[x] = {id: x, cell: []};
        for (let y = 0; y < tableSize; y++) {
            copy[x].cell[y] = {id: y, value: original[x].cell[y].value};
        }
    }


    for (let i = 0; i < numCellsToUpdate; i++) {
        let x = Math.floor(Math.random()*tableSize);
        let y = Math.floor(Math.random()*tableSize);
        copy[x].cell[y].value = Math.round(Math.random()*100);
    }
    return copy;
}

console.log(3)
let updateData = makeUpdate(tableLines);
console.log(4)
let patch = createPatch(tableLines, updateData)

console.log(patch);