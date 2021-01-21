import render from './output';

export default {
    render,
    data
}

function data() {
    let title = 'todo';
    let items = [
        {name: 'car', completed: false, cost: 10, id: 'a'},
        {name: 'plane', completed: true, cost: 100, id: 'b'},
        {name: 'boat', completed: false, cost: 50, id: 'c'}
    ];
    return function (index) {
        if (index === 0)
            return {title, items};
        else {
            items = [...items];
            if (index % 3 === 0)
                items.push({name: 'item ' + index, completed: !!(index % 2), cost: index, id: 'a' + index});
            if (index % 5 === 0) {
                let rand = Math.floor(Math.random() * items.length);
                items.splice(rand, 1);
            }
            if (index % 7 === 0) {
                let rand = Math.floor(Math.random() * items.length);
                let rand2 = Math.floor(Math.random() * items.length);
                let item = items.splice(rand, 1);
                items.splice(rand2, 0, item[0]);
            }
            return {title, items}
        }
    }
}