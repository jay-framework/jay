var i = { index: 0 };
var ii = { index: 1 };
var iii = { index: 2 };
var cycles = 10000000;
var a = [];
var b = [];
var c = new WeakSet();
var d = new Set();
var e = [];
var f = [];
var c1 = [i, 1];
var c2 = [iii, 3];
var c3 = [ii, 4];
function stepA() {
    a[0] = true;
    a[3] = true;
    a[4] = true;
    a[0] = false;
    a[3] = false;
    a[4] = false;
}
function stepB() {
    b.push([i, 1]);
    b.push([iii, 3]);
    b.push([ii, 4]);
    b = b.filter(function (_) {
        return !(_[0] === i && _[1] === 1);
    });
    b = b.filter(function (_) {
        return !(_[0] === ii && _[1] === 4);
    });
    b = b.filter(function (_) {
        return !(_[0] === iii && _[1] === 3);
    });
}
function stepC() {
    c.add(c1);
    c.add(c2);
    c.add(c3);
    c.delete(c1);
    c.delete(c2);
    c.delete(c3);
}
function stepD() {
    d.add(c1);
    d.add(c2);
    d.add(c3);
    d.delete(c1);
    d.delete(c2);
    d.delete(c3);
}
function stepE() {
    e[0] ? e[0].add(i) : (e[0] = new Set([i]));
    e[3] ? e[3].add(iii) : (e[3] = new Set([iii]));
    e[4] ? e[4].add(ii) : (e[4] = new Set([ii]));
    e[0].delete(i);
    e[3].delete(iii);
    e[4].delete(ii);
}
function stepF() {
    !f[0] && (f[0] = []);
    f[0][i.index] = c1;
    !f[3] && (f[3] = []);
    f[3][ii.index] = c2;
    !f[4] && (f[4] = []);
    f[4][iii.index] = c3;
    f[0][i.index] = undefined;
    f[3][ii.index] = undefined;
    f[4][iii.index] = undefined;
}
function stepG() {
    !f[0] && (f[0] = []);
    f[0][i.index] = c1;
    !f[3] && (f[3] = []);
    f[3][ii.index] = c2;
    !f[4] && (f[4] = []);
    f[4][iii.index] = c3;
    delete f[0][i.index];
    delete f[3][ii.index];
    delete f[4][iii.index];
}
function benchmark(name, step) {
    var start = new Date().getTime();
    for (var i_1 = 0; i_1 < cycles; i_1++) {
        step();
    }
    var end = new Date().getTime();
    console.log(name, end - start);
}
benchmark('A', stepA);
benchmark('B', stepB);
benchmark('C', stepC);
benchmark('D', stepD);
benchmark('E', stepE);
benchmark('F', stepF);
benchmark('G', stepG);
