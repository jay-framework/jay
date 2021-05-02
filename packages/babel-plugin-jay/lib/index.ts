import * as babel from '@babel/core';
import { BabelFile, NodePath, PluginObj, PluginPass } from '@babel/core';
import { ImportDeclaration } from '@babel/types';

// import {stylesheet} from "./parser";

// Main Babel Plugin Function
export default function ({ types: t }: typeof babel): PluginObj {
  return {
    name: 'identifier reverse',
    pre: (pluginPass: PluginPass, file: BabelFile): void => {
      console.log(pluginPass, require('util').inspect(pluginPass?.ast, false, 10, true));
    },
    visitor: {
      Identifier(idPath, path, state) {
        console.log('***', idPath.node.name, path, state);
      },
      JSXElement(idPath, path, state) {
        console.log('jsx', idPath.node, path, state);
      },
    },
  };
}
