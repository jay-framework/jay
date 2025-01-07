import * as React from 'react';
import {Cart, Cart2, CartProps} from './cart';
import {jay2React, jay2React2} from '../../../lib';

const ReactCart = jay2React(Cart);
const ReactCart2 = jay2React2(() => Cart2);

export interface AppProps extends CartProps {
    log?: (message: string) => void;
}

export default function App({ log, minimumOrder, total, lineItems }: AppProps) {
    return (
        <ReactCart2
            lineItems={lineItems}
            minimumOrder={minimumOrder}
            total={total}
            onCartEvent={(event) => log(`cart event: ${event.type}`)}
            onRemoveItem={(event) => log(`removed item ${event.itemId}`)}
        />
    );
}
