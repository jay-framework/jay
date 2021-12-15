import {describe, expect, it} from '@jest/globals'
import {typescriptCompiler} from "../lib/typescript-compiler";

describe.skip('typescript-compiler', () => {
    it('should extract types from a file', () => {
        let types = typescriptCompiler('./test/fixtures/attributes/generated', {relativePath: 'tsconfig-tests.json'});
        // console.log(types);
    })
});
