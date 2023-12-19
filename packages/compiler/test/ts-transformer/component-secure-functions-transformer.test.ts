import { componentSecureFunctionsTransformer } from '../../lib/ts-file/component-secure-functions-transformer';
import {readFileAndTsTransform} from "../test-utils/ts-compiler-test-utils";

describe('find jay component constructor', () => {
    it('transform counter component', async () => {
        const folder = 'components/counter';
        await readFileAndTsTransform(folder, [componentSecureFunctionsTransformer()])
    });
});
