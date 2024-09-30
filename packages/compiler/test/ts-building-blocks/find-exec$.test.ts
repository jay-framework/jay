import {createTsSourceFile} from "../test-utils/ts-source-utils";
import {findExec$} from "../../lib/ts-file/building-blocks/find-exec$";
import {SourceFileBindingResolver} from "../../lib/ts-file/basic-analyzers/source-file-binding-resolver";

describe('find exec$', (): void => {

    function prepare(code: string) {
        const sourceFile = createTsSourceFile(code);
        const bindingResolver = new SourceFileBindingResolver(sourceFile);
        return {sourceFile, bindingResolver}
    }

    it('should find exec$ function call with no return', () => {
        const {sourceFile, bindingResolver} = prepare(`
            import {exec$} from "jay-secure";
            export function bla() {
                exec$(() => console.log('hi'));
            }
        `);

        const foundExec$s = findExec$(bindingResolver, sourceFile);
        expect(foundExec$s).toHaveLength(1);
    })

    it('should find exec$ function call and return', () => {
        const {sourceFile, bindingResolver} = prepare(`
            import {exec$} from "jay-secure";
            export async function bla() {
                const res = await exec$(() => {
                    console.log('hi'); 
                    return 'x'}
                );
            }
        `);

        const foundExec$s = findExec$(bindingResolver, sourceFile);
        expect(foundExec$s).toHaveLength(1);
    })
})