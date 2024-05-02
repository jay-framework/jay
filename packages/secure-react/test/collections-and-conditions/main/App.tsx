import * as React from 'react';
import { CartBridge, CartProps } from './cart.tsx';
import { JayReactMainRoot } from '../../../lib/main-root.tsx';

export default function App(cartProps: CartProps) {
    return (
        <JayReactMainRoot viewState={cartProps}>
            <CartBridge
                lineItems={cartProps.lineItems}
                minimumOrder={cartProps.minimumOrder}
                total={cartProps.total}
                coordinate={['comp1']}
            />
        </JayReactMainRoot>
    );
}
