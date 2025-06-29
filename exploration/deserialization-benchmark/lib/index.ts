import { mutableObject } from '@jay-framework/mutable';
import { REPLACE } from '@jay-framework/json-patch';
import { patchMutable } from './patch-mutable';
import { patchImmutable } from './patch-immutable';

const BENCHMARK_CYCLES = 1000;
const TABLE_SIZE = 100;
const PATCH_SIZE = 100;

function initTable(tableSize) {
    let tableLines = [];
    for (let x = 0; x < tableSize; x++) {
        tableLines[x] = { id: x, cell: [] };
        for (let y = 0; y < tableSize; y++) {
            tableLines[x].cell[y] = { id: y, value: Math.round(Math.random() * 100) };
        }
    }
    return tableLines;
}

function createPatch(tableSize, patchSize) {
    let patch = [];
    for (let i = 0; i < patchSize; i++) {
        let x = Math.floor(Math.random() * tableSize);
        let y = Math.floor(Math.random() * tableSize);
        patch.push({
            op: REPLACE,
            path: ['' + x, 'cell', '' + y, 'value'],
            value: Math.round(Math.random() * 100),
        });
    }
    return patch;
}

function benchmarkMutable() {
    let mutableTable = mutableObject(initTable(TABLE_SIZE));
    let jsonPatch = createPatch(TABLE_SIZE, PATCH_SIZE);
    patchMutable(mutableTable, jsonPatch);

    // console.log('creating patches')
    let start = performance.now();
    let patches = [];
    for (let i = 0; i < BENCHMARK_CYCLES; i++) {
        patches[i] = createPatch(TABLE_SIZE, PATCH_SIZE);
    }
    // console.log('start', start);
    for (let i = 0; i < BENCHMARK_CYCLES; i++) {
        patchMutable(mutableTable, patches[i]);
        mutableTable.freeze();
    }
    let end = performance.now();
    // console.log('end', end);
    console.log(`mutable (avg of ${BENCHMARK_CYCLES} runs):  `, (end - start) / BENCHMARK_CYCLES);
}

function benchmarkImmutable() {
    let table = initTable(TABLE_SIZE);
    let jsonPatch = createPatch(TABLE_SIZE, PATCH_SIZE);
    patchMutable(table, jsonPatch);

    // console.log('creating patches')
    let start = performance.now();
    let patches = [];
    for (let i = 0; i < BENCHMARK_CYCLES; i++) {
        patches[i] = createPatch(TABLE_SIZE, PATCH_SIZE);
    }
    // console.log('start', start);
    for (let i = 0; i < BENCHMARK_CYCLES; i++) {
        patchImmutable(table, patches[i]);
    }
    let end = performance.now();
    // console.log('end', end);
    console.log(`immutable (avg of ${BENCHMARK_CYCLES} runs):`, (end - start) / BENCHMARK_CYCLES);
}

for (let i = 0; i < 10; i++) {
    benchmarkMutable();
    benchmarkImmutable();
}
