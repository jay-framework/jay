import {parseJayFile, JayPrimitiveTypes} from '../lib/compiler';
import {describe, expect, it} from '@jest/globals'

describe('compiler', () => {

    describe('parse jay file', () => {

        function jayFileWith(jayYaml, body) {
            return `
<html>
    <head>
        <script type="application/yaml-jay">
${jayYaml}
        </script>
    </head>
    ${body}
</html>`
        }

        it('should parse simple string type with no examples', () => {
            let jayFile = parseJayFile(jayFileWith(`
                data:
                    text: string
            `, '<body></body>'))
            
            expect(jayFile.val.types).toEqual({text: JayPrimitiveTypes.type_string});
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should parse simple string type with a simple example', () => {
            let jayFile = parseJayFile(jayFileWith(`
                data:
                    text: string

                example:
                    text: 'hello world'
            `, '<body></body>'))

            expect(jayFile.val.types).toEqual({text: JayPrimitiveTypes.type_string});
            expect(jayFile.val.examples).toEqual([{name: "example", data:{text: "hello world"}}]);
        });

        it('should parse invalid type', () => {
            let jayFile = parseJayFile(jayFileWith(`
                data:
                    text: bla
            `, '<body></body>'))

            expect(jayFile.validations).toEqual(["invalid type [bla] found at [data.text]"]);
        });

        it('should parse complex', () => {
            let jayFile = parseJayFile(jayFileWith(`
                data:
                    s1: string
                    n1: number
                    b1: boolean
                    o1: 
                        s2: string
                        n2: number
                    a1: 
                     -  s3: string
                        n3: number
            `, '<body></body>'))

            expect(jayFile.val.types).toEqual({
                s1: JayPrimitiveTypes.type_string,
                n1: JayPrimitiveTypes.type_number,
                b1: JayPrimitiveTypes.type_boolean,
                o1: {
                    s2: JayPrimitiveTypes.type_string,
                    n2: JayPrimitiveTypes.type_number
                },
                a1: [{
                    s3: JayPrimitiveTypes.type_string,
                    n3: JayPrimitiveTypes.type_number}
                ]});
            expect(jayFile.val.examples).toEqual([]);
        });

        it('should report on a file with two yaml-jay', () => {
            let jayFile = parseJayFile(`
<html>
    <head>
        <script type="application/yaml-jay">
data:
  name: string
        </script>
        <script type="application/yaml-jay">
data:
  name: string
        </script>
    </head>
    <body>x</body>
</html>`)
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found 2"]);
        })

        it('should report on a file without yaml-jay', () => {
            let jayFile = parseJayFile(`
<html>
    <head>
    </head>
    <body>x</body>
</html>`)
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found none"]);
        })

        it('should report on a non html file', () => {
            let jayFile = parseJayFile(`rrgargaergargaerg aergaegaraer aer erager`)
            expect(jayFile.validations).toEqual(["jay file should have exactly one yaml-jay script, found none"]);
        })

        it('should report on a file without a body', () => {
            let jayFile = parseJayFile(`
<html>
    <head>
        <script type="application/yaml-jay">
data:
  name: string
        </script>
    </head>
</html>`)
            expect(jayFile.validations).toEqual(["jay file must have exactly a body tag"]);
        })
    })

});

