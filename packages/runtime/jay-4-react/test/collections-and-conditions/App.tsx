import * as React from 'react';
import { Cart, CartProps } from './cart';

export interface AppProps extends CartProps {
    log?: (message: string) => void;
}

export default function App({ log, minimumOrder, total, lineItems }: AppProps) {
    return (
        <Cart
            lineItems={lineItems}
            minimumOrder={minimumOrder}
            total={total}
            onCartEvent={(event) => log(`cart event: ${event.event.type}`)}
            onRemoveItem={(event) => log(`removed item ${event.event.itemId}`)}
        />
    );
}
