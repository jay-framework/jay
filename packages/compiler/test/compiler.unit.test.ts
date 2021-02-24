import {generateDefinitionFile, generateTypes} from '../lib/compiler';
import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayPrimitiveTypes as JPT} from "../lib/parse-jay-file";

describe('compiler', () => {

    function jayFileWith(jayYaml, body) {
        return stripMargin(
            ` <html>
                |   <head>
                |     <script type="application/yaml-jay">
                |${stripMargin(jayYaml)}
                |     </script>
                |   </head>
                |   ${stripMargin(body)}
                | </html>`)
    }

    describe('generate data interfaces', () => {
        it('should generate simple interface', () => {
            let genInterface = generateTypes({
                name: JPT.type_string,
                age: JPT.type_number,
                bool: JPT.type_boolean,
                bdate: JPT.type_date
            });
            expect(genInterface).toEqual(stripMargin(
                `interface ViewState {
                |  name: string,
                |  age: number,
                |  bool: boolean,
                |  bdate: Date
                |}`));
        })

        it('should generate interface with complex object types', () => {
            let genInterface = generateTypes({
                name: JPT.type_string,
                address: {
                    street: JPT.type_string,
                }
            });
            expect(genInterface).toEqual(stripMargin(
                `interface Address {
                |  street: string
                |}
                |
                |interface ViewState {
                |  name: string,
                |  address: Address
                |}`));
        })

        it('should generate interface with complex array of object types', () => {
            let genInterface = generateTypes({
                name: JPT.type_string,
                address: [{
                    street: JPT.type_string,
                }]
            });
            expect(genInterface).toEqual(stripMargin(
                `interface Address {
                |  street: string
                |}
                |
                |interface ViewState {
                |  name: string,
                |  address: Array<Address>
                |}`));
        })
    })

    describe('generate the definition file', () => {
        it('should generate definition file for simple file', () => {
            const jayFile = jayFileWith(
                ` data:
                        |   s1: string
                        |   n1: number
                        |   b1: boolean
                        |   o1: 
                        |       s2: string
                        |       n2: number
                        |   a1: 
                        |    -  s3: string
                        |       n3: number`,
                '<body></body>');
            let definitionFile = generateDefinitionFile(jayFile);
            expect(definitionFile.val).toEqual(stripMargin(
                `import {JayElement} from "jay-runtime";
                |
                |interface O1 {
                |  s2: string,
                |  n2: number
                |}
                |
                |interface A1 {
                |  s3: string,
                |  n3: number
                |}
                |
                |interface ViewState {
                |  s1: string,
                |  n1: number,
                |  b1: boolean,
                |  o1: O1,
                |  a1: Array<A1>
                |}
                |
                |export declare function render(viewState: ViewState): JayElement<ViewState>`));
        })
    })
});

