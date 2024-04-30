import * as React from "react";
import {CartBridge} from "./cart.tsx";
import {JayReactMainRoot} from "../../../lib/main-root.tsx";


export default function App() {
    return (
        <JayReactMainRoot viewState={{initialCount: 12}}>
            <CartBridge lineItems={[]} minimumOrder={20} total={30} coordinate={["comp1"]}/>
        </JayReactMainRoot>
    )
}