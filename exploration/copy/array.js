const cycles = 1000;
let x = [];

for (let i = 0; i < 1000; i++) x[i] = i;

let s = process.hrtime();
for (let t = 0; t < cycles; t++) {
    let y = [];
    for (let i in x) {
        let v = x[i];
        if (v % 2 === 0) y[i] = x[i] * 2;
        else y[i] = x[i];
    }
}
let e = process.hrtime(s);
console.log('for let in', e);

s = process.hrtime();
for (let t = 0; t < cycles; t++) {
    let y = [];
    y.length = x.length;
    for (let i in x) {
        let v = x[i];
        if (v % 2 === 0) y[i] = x[i] * 2;
        else y[i] = x[i];
    }
}
e = process.hrtime(s);
console.log('for let in, with length', e);

s = process.hrtime();
for (let t = 0; t < cycles; t++) {
    let y = x.map((_) => (_ % 2 === 0 ? _ * 2 : _));
}
e = process.hrtime(s);
console.log('map', e);
