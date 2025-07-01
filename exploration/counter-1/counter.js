'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Counter = void 0;
var counter_jay_1 = require('./counter.jay');
function Counter(initial) {
    var count = initial;
    var element = (0, counter_jay_1.render)({ count: count });
    function inc() {
        count += 1;
        element.update({ count: count });
    }
    function dec() {
        count -= 1;
        element.update({ count: count });
    }
    element.events.onDec(function (_) {
        return dec();
    });
    element.events.onInc(function (_) {
        return inc();
    });
    var update = function (viewState) {
        count = viewState.count;
        element.update({ count: count });
    };
    return {
        dom: element.dom,
        update: update,
    };
}
exports.Counter = Counter;
