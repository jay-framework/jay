import {describe, expect, it} from '@jest/globals'
import stripMargin from '@caiogondim/strip-margin'
import {JayArrayType, JayBoolean, JayNumber, JayObjectType, JayString, parseJayFile} from "../lib/parse-jay-file";

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
                '<body></body>'), 'Base')
            
            expect(jayFile.val.types).toEqual(new JayObjectType('BaseViewState', {text: JayString}));
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should append the base name to the view state type', () => {
            let jayFile = parseJayFile(jayFileWith(
                `data:
                        |   text: string
                        |`,
                '<body></body>'), 'BaseElementName')

            expect(jayFile.val.types).toEqual(new JayObjectType('BaseElementNameViewState', {text: JayString}));
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should parse simple string type with a simple example', () => {
            let jayFile = parseJayFile(jayFileWith(
                ` data:
                        |   text: string
                        |
                        | example:
                        |   text: 'hello world'`,
                '<body></body>'), 'Base')

            expect(jayFile.val.types).toEqual(new JayObjectType('BaseViewState',{text: JayString}));
            expect(jayFile.val.examples).toEqual([{name: "example", data:{text: "hello world"}}]);
        });

        it('should parse invalid type', () => {
            let jayFile = parseJayFile(jayFileWith(
                ` data:
                        |   text: bla`,
                '<body></body>'), 'Base')

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
                '<body></body>'), 'Base')

            expect(jayFile.val.types).toEqual(new JayObjectType('BaseViewState',{
                s1: JayString,
                n1: JayNumber,
                b1: JayBoolean,
                o1: new JayObjectType("O1", {
                    s2: JayString,
                    n2: JayNumber
                }),
                a1: new JayArrayType(new JayObjectType("A1", {
                    s3: JayString,
                    n3: JayNumber}
                ))}));
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
                |</html>`), 'Base')
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found 2"]);
        })

        it('should report on a file without yaml-jay', () => {
            let jayFile = parseJayFile(stripMargin(
                `<html>
                |    <head>
                |    </head>
                |    <body>x</body>
                |</html>`), 'Base')
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found none"]);
        })

        it('should report on a non html file', () => {
            let jayFile = parseJayFile(`rrgargaergargaerg aergaegaraer aer erager`, 'Base')
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
                |</html>`), 'Base')
            expect(jayFile.validations).toEqual(["jay file must have exactly a body tag"]);
        })
    })

});

