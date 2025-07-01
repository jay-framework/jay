'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Counter = void 0;
var counter_jay_1 = require('./counter.jay');
function Counter(initial) {
    var count = initial;
    function inc() {
        count += 1;
        element.update({ count: count });
    }
    function dec() {
        count -= 1;
        element.update({ count: count });
    }
    function bindEvents(id, elem) {
        if (id === 'dec')
            elem.addEventListener('click', function (_) {
                return dec();
            });
        else if (id === 'inc')
            elem.addEventListener('click', function (_) {
                return inc();
            });
    }
    var element = (0, counter_jay_1.render)({ count: count }, bindEvents);
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
