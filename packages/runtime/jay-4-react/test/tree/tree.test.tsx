import { fireEvent, render, screen } from '@testing-library/react';
import App from './target/App';
import {Node} from './target/tree-node'
import { vi } from 'vitest';

describe('Simple react component', () => {

    const NODE: Node = {
        id: "a", name: "root", children: [
            {id: 'a1', name: '[A]', children: [
                    {id: 'a1a1', name: '[A.A]', children: [
                            {id: 'a1a1a1', name: '[A.A.A]', children: []}
                        ]
                    },
                    {id: 'a1b1', name: '[A.B]', children: []},
                ]},
            {id: 'b1', name: '[B]', children: []},
            {id: 'c1', name: '[C]', children: []}]
    }

    async function mkElement() {
        const onCounterChange = vi.fn();
        render(<App node={NODE} />);
        return { onCounterChange };
    }

    it('render a tree', async () => {
        await mkElement();

        expect(screen.getByRole('app')).toHaveTextContent('▼root▼[A]▼[A.A][A.A.A][A.B][B][C]');
    });

    it('collapse the all tree', async () => {
        await mkElement();

        fireEvent.click(screen.getByRole('head-a'));
        expect(screen.getByRole('app')).toHaveTextContent('►root');
    });

    it('collapse a sub tree', async () => {
        await mkElement();

        fireEvent.click(screen.getByRole('head-a1'));
        expect(screen.getByRole('app')).toHaveTextContent('▼root►[A][B][C]');
    });
});
