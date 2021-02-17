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
            
            expect(jayFile.types).toEqual({text: JayPrimitiveTypes.type_string});
            expect(jayFile.examples).toEqual([]);
        });

        it('should parse simple string type with a simple example', () => {
            let jayFile = parseJayFile(jayFileWith(`
                data:
                    text: string

                example:
                    text: 'hello world'
            `, '<body></body>'))

            expect(jayFile.types).toEqual({text: JayPrimitiveTypes.type_string});
            expect(jayFile.examples).toEqual([{name: "example", data:{text: "hello world"}}]);
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

            expect(jayFile.types).toEqual({
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
            expect(jayFile.examples).toEqual([]);
        });
    })

});

