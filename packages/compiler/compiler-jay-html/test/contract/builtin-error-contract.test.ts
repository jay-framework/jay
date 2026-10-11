import { describe, it, expect } from 'vitest';
import { compileContract } from '../../lib';
import { ERROR_CONTRACT, ERROR_CONTRACT_MODULE } from '../../lib';
import { JAY_IMPORT_RESOLVER } from '../../lib';
import { WithValidations, prettify } from '@jay-framework/compiler-shared';
import { readFixtureElementDefinitionFile } from '../test-utils/file-utils';

// Design Log #218 — the built-in Error contract. This test locks the generated shape so it stays in
// sync with the hand-written types shipped from @jay-framework/fullstack-component
// (lib/error-contract.ts). If this fixture changes, update those types to match.

describe('built-in Error contract (DL#218)', () => {
    it('compiles ERROR_CONTRACT to the shipped ErrorViewState / ErrorRefs shape', async () => {
        const compiled = await compileContract(
            new WithValidations(ERROR_CONTRACT, []),
            ERROR_CONTRACT_MODULE,
            JAY_IMPORT_RESOLVER,
        );

        expect(compiled.validations).toEqual([]);
        expect(await prettify(compiled.val)).toEqual(
            await readFixtureElementDefinitionFile(
                'contracts/builtin-error',
                'error.jay-contract.d.ts',
            ),
        );
    });
});
