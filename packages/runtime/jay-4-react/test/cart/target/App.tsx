import * as React from 'react';
import { Cart, CartProps } from './cart';
import { jay2React } from '../../../lib';

const ReactCart2 = jay2React(() => Cart);

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
