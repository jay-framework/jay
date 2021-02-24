import {generateDefinitionFile, generateTypes} from '../lib/compiler';
import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayPrimitiveTypes as JPT, parseJayFile} from "../lib/parse-jay-file";

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

    describe('parse jay file', () => {
        
        it('should parse simple string type with no examples', () => {
            let jayFile = parseJayFile(jayFileWith(
                `data:
                        |   text: string
                        |`,
                '<body></body>'))
            
            expect(jayFile.val.types).toEqual({text: JPT.type_string});
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should parse simple string type with a simple example', () => {
            let jayFile = parseJayFile(jayFileWith(
                ` data:
                        |   text: string
                        |
                        | example:
                        |   text: 'hello world'`,
                '<body></body>'))

            expect(jayFile.val.types).toEqual({text: JPT.type_string});
            expect(jayFile.val.examples).toEqual([{name: "example", data:{text: "hello world"}}]);
        });

        it('should parse invalid type', () => {
            let jayFile = parseJayFile(jayFileWith(
                ` data:
                        |   text: bla`,
                '<body></body>'))

            expect(jayFile.validations).toEqual(["invalid type [bla] found at [data.text]"]);
        });

        it('should parse complex', () => {
            let jayFile = parseJayFile(jayFileWith(
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
                '<body></body>'))

            expect(jayFile.val.types).toEqual({
                s1: JPT.type_string,
                n1: JPT.type_number,
                b1: JPT.type_boolean,
                o1: {
                    s2: JPT.type_string,
                    n2: JPT.type_number
                },
                a1: [{
                    s3: JPT.type_string,
                    n3: JPT.type_number}
                ]});
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should report on a file with two yaml-jay', () => {
            let jayFile = parseJayFile(stripMargin(
                `<html>
                |    <head>
                |        <script type="application/yaml-jay">
                |data:
                |  name: string
                |        </script>
                |        <script type="application/yaml-jay">
                |data:
                |  name: string
                |        </script>
                |    </head>
                |    <body>x</body>
                |</html>`))
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found 2"]);
        })

        it('should report on a file without yaml-jay', () => {
            let jayFile = parseJayFile(stripMargin(
                `<html>
                |    <head>
                |    </head>
                |    <body>x</body>
                |</html>`))
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found none"]);
        })

        it('should report on a non html file', () => {
            let jayFile = parseJayFile(`rrgargaergargaerg aergaegaraer aer erager`)
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found none"]);
        })

        it('should report on a file without a body', () => {
            let jayFile = parseJayFile(stripMargin(
                `<html>
                |    <head>
                |        <script type="application/yaml-jay">
                |data:
                |  name: string
                |        </script>
                |    </head>
                |</html>`))
            expect(jayFile.validations).toEqual(["jay file must have exactly a body tag"]);
        })
    })

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

