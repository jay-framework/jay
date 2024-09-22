import React, { useEffect, useState } from 'react';
import benchmark from './benchmark';

interface CollectionsProps {
    cycles: number;
    running: boolean;
    progressCallback: (string, boolean) => void;
}

let nextId = 0;
export function Collections({ cycles, running, progressCallback }: CollectionsProps) {
    let [title, setTitle] = useState('collection');
    let [items, setItems] = useState([
        { name: 'car', completed: false, cost: 10, id: 'a' },
        { name: 'plane', completed: true, cost: 100, id: 'b' },
        { name: 'boat', completed: false, cost: 50, id: 'c' },
    ]);

    const updateCollection = (index: number) => {
        nextId += 1;
        setItems((oldItems) => {
            let newItems = [...oldItems];
            if (index % 2 === 0) {
                let index = Math.floor(newItems.length * Math.random());
                let clone = { ...newItems[index] };
                clone.cost += 1000;
                newItems[index] = clone;
            }
            if (index % 3 === 0) {
                newItems.push({
                    name: 'item ' + nextId,
                    completed: !!(index % 2),
                    cost: index,
                    id: 'a' + nextId,
                });
            }
            if (index % 5 === 0) {
                let rand = Math.floor(Math.random() * newItems.length);
                newItems.splice(rand, 1);
            }
            if (index % 7 === 0) {
                let rand = Math.floor(Math.random() * newItems.length);
                let rand2 = Math.floor(Math.random() * newItems.length);
                let item = newItems.splice(rand, 1);
                newItems.splice(rand2, 0, item[0]);
            }
            return newItems;
        });
    };

    useEffect(() => {
        if (running) {
            benchmark((index) => updateCollection(index), cycles, progressCallback);
        }
    }, [running]);

    return (
        <div>
            <h1>{title}</h1>
            <p>Number of items: {items.length}</p>
            <div>
                {items.map((item) => (
                    <div key={item.id}>
                        <span style={{ color: 'green', width: '100px', display: 'inline-block' }}>
                            {item.name}
                        </span>
                        <span style={{ color: 'red', width: '100px', display: 'inline-block' }}>
                            {item.completed}
                        </span>
                        <span style={{ color: 'blue', width: '100px', display: 'inline-block' }}>
                            {item.cost}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
