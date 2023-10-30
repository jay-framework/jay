import * as babel from '@babel/core';
import { BabelFile, PluginObj } from '@babel/core';

// import {stylesheet} from "./parser";

// Main Babel Plugin Function
export default function ({}: typeof babel): PluginObj {
    return {
        name: 'identifier reverse',
        pre: (_file: BabelFile): void => {
            console.log(this, require('util').inspect(this?.ast, false, 10, true));
        },
        visitor: {
            Identifier(idPath, path) {
                console.log('***', idPath.node.name, path);
            },
            JSXElement(idPath, path) {
                console.log('jsx', idPath.node, path);
            },
        },
    };
}
