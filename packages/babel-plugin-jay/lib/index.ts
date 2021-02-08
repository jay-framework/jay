import * as babel from "@babel/core";
import {NodePath, PluginObj} from "@babel/core";
import {ImportDeclaration} from "@babel/types";

// import {stylesheet} from "./parser";

// Main Babel Plugin Function
export default function ({types: t}: typeof babel): PluginObj {
    return {
        name: 'identifier reverse',
        visitor: {
            Identifier(idPath) {
                idPath.node.name = idPath.node.name.split('').reverse().join('')
            }
            // ImportDeclaration(path: NodePath<ImportDeclaration>, pass: any) {
            //     if (path.node.specifiers.length !== 1 || path.node.specifiers[0].type !== "ImportDefaultSpecifier") {
            //         return;
            //     }
            //
            //     // const styles = stylesheet(path.node.source.value, pass.file);
            //     // if (typeof styles !== "string") return;
            //
            //     // const variableDeclaration = t.variableDeclaration("const", [
            //     //     t.variableDeclarator(path.node.specifiers[0].local, t.stringLiteral(styles)),
            //     // ]);
            //
            //     // path.replaceWith(variableDeclaration);
            // },
        },
    };
}