import { componentSecureFunctionsTransformer } from '../../lib/ts-file/component-secure-functions-transformer.ts';
import {readFileAndTsTransform} from "../test-utils/compiler-utils.ts";

describe('find jay component constructor', () => {
    it('transform counter component', async () => {
        const folder = 'components/counter';
        await readFileAndTsTransform(folder, [componentSecureFunctionsTransformer()])
    });
});
