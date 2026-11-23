import { parse } from 'node-html-parser';
import { describe, it, expect } from 'vitest';
import { validate } from '../../lib/validators/a11y-validator.js';
import type {
    JayHtmlValidationContext,
    JayHtmlValidationFinding,
} from '@jay-framework/compiler-shared';

/** DL#240 — form hints, autocomplete and validation-styling rules. Row numbers follow the DL's §Tests table. */

const TAIL = (rule: string) =>
    ` Suppress with a11y: { allow-${rule}: true } in <script type="application/jay-validations">.` +
    '\nSee: agent-kit/designer/forms-and-autofill.md';

function makeContext(
    html: string,
    css?: string,
    overrides?: Record<string, boolean>,
): JayHtmlValidationContext {
    return {
        body: parse(html),
        filePath: 'test/page.jay-html',
        projectRoot: '/test',
        headlessImports: [],
        css,
        validationOverrides: overrides ? { a11y: overrides } : undefined,
    };
}

async function rule(
    ctx: JayHtmlValidationContext,
    id: string,
): Promise<JayHtmlValidationFinding[]> {
    return (await validate(ctx)).filter((f) => f.message.startsWith(`[a11y/${id}] `));
}

async function messages(html: string, id: string, css?: string): Promise<string[]> {
    return (await rule(makeContext(html, css), id)).map((f) => f.message);
}

async function cssMessages(css: string, id: string): Promise<string[]> {
    return messages('<div></div>', id, css);
}

const formRuleIds = (findings: JayHtmlValidationFinding[]) =>
    findings.map((f) => /^\[a11y\/([a-z-]+)\]/.exec(f.message)?.[1] ?? 'generic').sort();

const GENERIC_NO_LABEL = /^<input> has no associated label/;

describe('R1 placeholder-as-label', () => {
    it('T1: replaces the generic no-label error, exact finding', async () => {
        const findings = await validate(makeContext('<input type="text" placeholder="Name">'));
        expect(findings).toEqual([
            {
                severity: 'error',
                message:
                    '[a11y/placeholder-as-label] <input type="text"> (1st input in the file) with placeholder "Name" has no label — the placeholder disappears on typing and is not a reliable name (WCAG 1.3.1, 3.3.2)',
                suggestion:
                    'Add a <label for> (or aria-label) and keep the placeholder only as an optional example.' +
                    TAIL('placeholder-as-label'),
                element: '<input>',
                attribute: 'placeholder',
            },
        ]);
    });

    it('T2: located by id', async () => {
        const [message] = await messages(
            '<input type="text" id="n" placeholder="Name">',
            'placeholder-as-label',
        );
        expect(message).toMatch(
            /^\[a11y\/placeholder-as-label\] <input type="text" id="n"> with placeholder "Name"/,
        );
    });

    it('T4: allow-placeholder-as-label leaves only the generic no-label error', async () => {
        const findings = await validate(
            makeContext('<input type="text" placeholder="Name">', undefined, {
                'allow-placeholder-as-label': true,
            }),
        );
        expect(findings).toHaveLength(1);
        expect(findings[0].message).toMatch(GENERIC_NO_LABEL);
    });

    it('T104: textarea ordinal', async () => {
        const [message] = await messages(
            '<textarea placeholder="Notes"></textarea>',
            'placeholder-as-label',
        );
        expect(message).toMatch(
            /^\[a11y\/placeholder-as-label\] <textarea> \(1st textarea in the file\) with placeholder "Notes"/,
        );
    });
});

describe('R2 placeholder-format-hint', () => {
    it('T3: label wins over placeholder in the located element', async () => {
        const [message] = await messages(
            '<label>City <input type="text" placeholder="e.g. Paris"></label>',
            'placeholder-format-hint',
        );
        expect(message).toMatch(
            /^\[a11y\/placeholder-format-hint\] <input type="text"> labelled "City"/,
        );
    });

    it('T5: exact finding for a MM/YY placeholder', async () => {
        const found = await rule(
            makeContext('<label for="c">Card</label><input id="c" placeholder="MM/YY">'),
            'placeholder-format-hint',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/placeholder-format-hint] <input id="c"> puts a format or rule hint in its placeholder "MM/YY" — it disappears on typing (WCAG 3.3.2)',
                suggestion:
                    'Move the hint into an element above the field and link it with aria-describedby.' +
                    TAIL('placeholder-format-hint'),
                element: '<input>',
                attribute: 'placeholder',
            },
        ]);
    });

    it('T6: a linked hint above the field clears R2 and R4', async () => {
        const html =
            '<label for="c">Card</label><p id="h">MM/YY</p><input id="c" placeholder="MM/YY" aria-describedby="h">';
        expect(await messages(html, 'placeholder-format-hint')).toEqual([]);
        expect(await messages(html, 'hint-below-field')).toEqual([]);
    });

    it('T32: plain placeholders do not fire', async () => {
        for (const p of ['Leave a comment', 'Summer', 'Your address', '123 Main St']) {
            expect(
                await messages(
                    `<label>X <input type="text" placeholder="${p}"></label>`,
                    'placeholder-format-hint',
                ),
            ).toEqual([]);
        }
    });

    it('T33: format and rule hints fire', async () => {
        for (const p of ['YYYY-MM-DD', 'e.g. 555-1234', 'e.g. Jane', 'At least 8 characters']) {
            expect(
                await messages(
                    `<label>X <input type="text" placeholder="${p}"></label>`,
                    'placeholder-format-hint',
                ),
            ).toHaveLength(1);
        }
    });

    it('T95: lowercase mm/yy does not match', async () => {
        expect(
            await messages(
                '<label>X <input type="text" placeholder="mm/yy"></label>',
                'placeholder-format-hint',
            ),
        ).toEqual([]);
    });
});

describe('R3 describedby-missing-id', () => {
    it('T11: exact finding', async () => {
        const found = await rule(
            makeContext('<label for="e">E</label><input id="e" aria-describedby="nope">'),
            'describedby-missing-id',
        );
        expect(found).toEqual([
            {
                severity: 'error',
                message:
                    '[a11y/describedby-missing-id] <input id="e"> has aria-describedby "nope" but no element with id "nope" exists in this file (WCAG 1.3.1)',
                suggestion:
                    'Add id="nope" to the hint or error element, or remove the token.' +
                    TAIL('describedby-missing-id'),
                element: '<input>',
                attribute: 'aria-describedby',
            },
        ]);
    });

    it('T12: bound aria-describedby is skipped', async () => {
        expect(
            await messages(
                '<input id="e" aria-label="E" aria-describedby="{x}">',
                'describedby-missing-id',
            ),
        ).toEqual([]);
    });

    it('T13: inside forEach is skipped', async () => {
        expect(
            await messages(
                '<div forEach="items" trackBy="id"><input aria-label="E" aria-describedby="h"></div>',
                'describedby-missing-id',
            ),
        ).toEqual([]);
    });

    it('T14: a bound id does not count as present', async () => {
        expect(
            await messages(
                '<input aria-label="E" aria-describedby="h"><p id="{hintId}">x</p>',
                'describedby-missing-id',
            ),
        ).toHaveLength(1);
    });

    it('T96: names only the missing token', async () => {
        const [message] = await messages(
            '<p id="h1">x</p><input aria-label="E" aria-describedby="h1 missing">',
            'describedby-missing-id',
        );
        expect(message).toMatch(/aria-describedby "missing" but no element with id "missing"/);
    });
});

describe('R4 hint-below-field', () => {
    it('T7: exact finding for a hint after the input', async () => {
        const found = await rule(
            makeContext(
                '<label for="c">Card</label><input id="c" aria-describedby="h"><p id="h">MM/YY</p>',
            ),
            'hint-below-field',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/hint-below-field] <input id="c"> has its hint "#h" below the field — the mobile keyboard and autofill popovers can cover it',
                suggestion:
                    'Move the hint element above the field; error messages may stay below.' +
                    TAIL('hint-below-field'),
                element: '<input>',
                attribute: 'aria-describedby',
            },
        ]);
    });

    it('T8: password rules below the field', async () => {
        expect(
            await messages(
                '<label for="pw">Password</label><input id="pw" type="password" autocomplete="new-password" aria-describedby="pw-rules"><p id="pw-rules">At least 8 characters, one number</p>',
                'hint-below-field',
            ),
        ).toHaveLength(1);
    });

    it('T9: an error-like target below is exempt', async () => {
        expect(
            await messages(
                '<label for="e">Email</label><input id="e" aria-describedby="e-err"><span id="e-err" class="field-error">Enter a valid email</span>',
                'hint-below-field',
            ),
        ).toEqual([]);
    });

    it('T10: role=alert, aria-live, a text binding or an aria-errormessage target are exempt', async () => {
        for (const target of [
            '<span id="e-msg" role="alert">Bad</span>',
            '<span id="e-msg" aria-live="polite">Bad</span>',
            '<span id="e-msg">{emailError}</span>',
        ]) {
            expect(
                await messages(
                    `<label for="e">Email</label><input id="e" aria-describedby="e-msg">${target}`,
                    'hint-below-field',
                ),
            ).toEqual([]);
        }
        expect(
            await messages(
                '<label for="e">Email</label><input id="e" aria-describedby="e-msg" aria-errormessage="e-msg"><span id="e-msg">Bad</span>',
                'hint-below-field',
            ),
        ).toEqual([]);
    });

    it('T34 / T82: a hint that contains the control does not fire', async () => {
        expect(
            await messages(
                '<div id="h"><label for="c">Card</label><input id="c" aria-describedby="h"></div>',
                'hint-below-field',
            ),
        ).toEqual([]);
    });

    it('T35: checkbox descriptions are out of scope', async () => {
        expect(
            await messages(
                '<input type="checkbox" id="t" aria-describedby="t-d"><label for="t">Terms</label><p id="t-d">You can unsubscribe any time</p>',
                'hint-below-field',
            ),
        ).toEqual([]);
    });

    it('T36: textarea hint below fires', async () => {
        expect(
            await messages(
                '<label for="b">Bio</label><textarea id="b" aria-describedby="h"></textarea><p id="h">Max 200 words</p>',
                'hint-below-field',
            ),
        ).toHaveLength(1);
    });

    it('T80: a conditional ancestor below the common ancestor exempts the hint', async () => {
        expect(
            await messages(
                '<div><input aria-label="Card" aria-describedby="h"><div if="showHint"><p id="h">Use MM/YY</p></div></div>',
                'hint-below-field',
            ),
        ).toEqual([]);
    });

    it('T81: a conditional common ancestor does not exempt it', async () => {
        expect(
            await messages(
                '<div if="showForm"><input aria-label="Card" aria-describedby="h"><p id="h">Use MM/YY</p></div>',
                'hint-below-field',
            ),
        ).toHaveLength(1);
    });
});

describe('R5 autocomplete-invalid', () => {
    it('T15: typo map, exact finding', async () => {
        const found = await rule(
            makeContext(
                '<label for="p">Phone</label><input id="p" type="tel" autocomplete="phone">',
            ),
            'autocomplete-invalid',
        );
        expect(found).toEqual([
            {
                severity: 'error',
                message:
                    '[a11y/autocomplete-invalid] <input type="tel" id="p"> has invalid autocomplete "phone" (WCAG 1.3.5)',
                suggestion: 'Use autocomplete="tel".' + TAIL('autocomplete-invalid'),
                element: '<input>',
                attribute: 'autocomplete',
            },
        ]);
    });

    it('T16 / T93: valid token lists, case-insensitive', async () => {
        for (const value of [
            'shipping street-address',
            'section-a billing postal-code',
            'work email',
            'username webauthn',
            'Email',
            'Shipping Postal-Code',
        ]) {
            expect(
                await messages(
                    `<input aria-label="X" autocomplete="${value}">`,
                    'autocomplete-invalid',
                ),
            ).toEqual([]);
        }
    });

    it('T17: a modifier before a non-contact field is invalid', async () => {
        expect(
            await messages(
                '<input aria-label="X" autocomplete="work postal-code">',
                'autocomplete-invalid',
            ),
        ).toHaveLength(1);
    });

    it('T37: unknown token gets the generic suggestion', async () => {
        const [finding] = await rule(
            makeContext('<input aria-label="X" autocomplete="qwerty">'),
            'autocomplete-invalid',
        );
        expect(finding.suggestion).toEqual(
            'Use a valid token from the HTML autofill list.' + TAIL('autocomplete-invalid'),
        );
    });

    it('T94: webauthn must be last', async () => {
        expect(
            await messages(
                '<input aria-label="X" autocomplete="webauthn username">',
                'autocomplete-invalid',
            ),
        ).toHaveLength(1);
    });

    it('T107 / T108: form allows only on/off', async () => {
        expect(await messages('<form autocomplete="off"></form>', 'autocomplete-invalid')).toEqual(
            [],
        );
        expect(
            await messages('<form autocomplete="email"></form>', 'autocomplete-invalid'),
        ).toHaveLength(1);
    });
});

describe('R6 autocomplete-missing', () => {
    it('T18: exact finding for type=email', async () => {
        const found = await rule(
            makeContext('<label for="e">Email</label><input id="e" type="email">'),
            'autocomplete-missing',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/autocomplete-missing] <input type="email" id="e"> looks like an identity or contact field but has no autocomplete (WCAG 1.3.5)',
                suggestion:
                    'Add autocomplete="email" (or autocomplete="off" if autofill is unwanted).' +
                    TAIL('autocomplete-missing'),
                element: '<input>',
                attribute: 'autocomplete',
            },
        ]);
    });

    async function suggestedToken(html: string): Promise<string[]> {
        return (await rule(makeContext(html), 'autocomplete-missing')).map(
            (f) => /Add autocomplete="([^"]+)"/.exec(f.suggestion ?? '')?.[1] ?? '?',
        );
    }

    it('T19 / T51 / T87 / T91: name heuristics, first row wins', async () => {
        expect(await suggestedToken('<label>Z <input name="zipCode"></label>')).toEqual([
            'postal-code',
        ]);
        expect(await suggestedToken('<label>E <input name="emailAddress"></label>')).toEqual([
            'email',
        ]);
        expect(await suggestedToken('<label>C <input name="companyName"></label>')).toEqual([
            'organization',
        ]);
        expect(await suggestedToken('<label>L <input name="lastName"></label>')).toEqual([
            'family-name',
        ]);
        expect(await suggestedToken('<label>F <input name="firstName"></label>')).toEqual([
            'given-name',
        ]);
        expect(await suggestedToken('<label>C <input name="country"></label>')).toEqual([
            'country-name',
        ]);
    });

    /**
     * Bug: "name" matched as a word anywhere, so `productName` got autocomplete="name".
     * Found in: fake-shop src/pages/upload (validate run during DL#240 implementation).
     * Expected: the §3 row is "full name / name (alone)" — only `name` / `fullName` match.
     * Actual: `<input id="productName">` was reported as an identity field.
     */
    it('should match the name row only when the name/id is name or full name alone', async () => {
        expect(await suggestedToken('<label>P <input id="productName"></label>')).toEqual([]);
        expect(await suggestedToken('<label>F <input name="fullName"></label>')).toEqual(['name']);
        expect(await suggestedToken('<label>N <input name="name"></label>')).toEqual(['name']);
    });

    it('T89 / T90: textarea address and select country', async () => {
        expect(
            await suggestedToken('<label>A <textarea name="address"></textarea></label>'),
        ).toEqual(['street-address']);
        expect(
            await suggestedToken(
                '<label>C <select name="country"><option>x</option></select></label>',
            ),
        ).toEqual(['country']);
    });

    it('T20 / T88 / T92 / T99 / T100 / T101 / T21: out of scope fields do not fire', async () => {
        for (const html of [
            '<label>S <input name="search"></label>',
            '<label>C <input name="coupon"></label>',
            '<label>M <textarea name="message"></textarea></label>',
            '<label>N <textarea name="notes"></textarea></label>',
            '<label>I <input name="ipAddress"></label>',
            '<label>M <input name="macAddress"></label>',
            '<label>O <input type="checkbox" name="emailOptIn"></label>',
            '<label>P <input type="radio" name="phone"></label>',
            '<label>P <input type="password" name="loginPassword" autocomplete="current-password"></label>',
            '<label>E <input type="email" autocomplete="off"></label>',
        ]) {
            expect(await messages(html, 'autocomplete-missing')).toEqual([]);
        }
    });
});

describe('R7 password-autocomplete', () => {
    it('T22: exact finding', async () => {
        const found = await rule(
            makeContext(
                '<label for="pw">Password</label><input type="password" name="pw" id="pw">',
            ),
            'password-autocomplete',
        );
        expect(found).toEqual([
            {
                severity: 'error',
                message:
                    '[a11y/password-autocomplete] <input type="password" name="pw"> has no autocomplete="current-password", "new-password" or "one-time-code" — password managers can\'t fill or save it (WCAG 1.3.5)',
                suggestion:
                    'Add autocomplete="current-password" on sign-in or autocomplete="new-password" when choosing a password.' +
                    TAIL('password-autocomplete'),
                element: '<input>',
                attribute: 'autocomplete',
            },
        ]);
    });

    it('T23: autocomplete=off is still flagged', async () => {
        expect(
            await messages(
                '<label>P <input type="password" autocomplete="off"></label>',
                'password-autocomplete',
            ),
        ).toHaveLength(1);
    });

    it('T24: one-time-code is accepted', async () => {
        expect(
            await messages(
                '<label>P <input type="password" autocomplete="one-time-code"></label>',
                'password-autocomplete',
            ),
        ).toEqual([]);
    });
});

describe('R8 username-autocomplete', () => {
    const LOGIN =
        '<form><label for="e">Email</label><input id="e" type="email" name="email">' +
        '<label for="p">Password</label><input id="p" type="password" autocomplete="current-password"></form>';

    it('T25: exact finding, and no R6 on that field', async () => {
        const findings = await validate(makeContext(LOGIN));
        expect(findings).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/username-autocomplete] <input type="email" name="email"> is the sign-in name for the password field but has no autocomplete="username" (WCAG 1.3.5)',
                suggestion:
                    'Add autocomplete="username" (or "username webauthn" with passkeys).' +
                    TAIL('username-autocomplete'),
                element: '<input>',
                attribute: 'autocomplete',
            },
        ]);
    });

    it('T102: allow-username-autocomplete silences R8 and R6 does not return', async () => {
        expect(
            await validate(makeContext(LOGIN, undefined, { 'allow-username-autocomplete': true })),
        ).toEqual([]);
    });

    it('T26: sign-up — R6 on name, R8 on email', async () => {
        const html =
            '<form><label for="n">Name</label><input id="n" name="name">' +
            '<label for="e">Email</label><input id="e" type="email" name="email">' +
            '<label for="p">Password</label><input id="p" type="password" autocomplete="new-password"></form>';
        const findings = await validate(makeContext(html));
        expect(formRuleIds(findings)).toEqual(['autocomplete-missing', 'username-autocomplete']);
        expect(
            findings.find((f) => f.message.startsWith('[a11y/autocomplete-missing]'))?.message,
        ).toMatch(/name="name"/);
        expect(
            findings.find((f) => f.message.startsWith('[a11y/username-autocomplete]'))?.message,
        ).toMatch(/name="email"/);
    });

    it('T27: no form — nearest preceding input in document order', async () => {
        const html =
            '<div><label for="e">Email</label><input id="e" type="email" name="email"></div>' +
            '<div><label for="p">Password</label><input id="p" type="password" autocomplete="current-password"></div>';
        expect(await messages(html, 'username-autocomplete')).toHaveLength(1);
    });

    it('T97: a header search box is never the candidate', async () => {
        const html =
            '<header><input type="search" name="q" aria-label="Search"></header>' +
            '<div><label for="e">Email</label><input id="e" type="email" name="email">' +
            '<label for="p">Password</label><input id="p" type="password" autocomplete="current-password"></div>';
        const found = await messages(html, 'username-autocomplete');
        expect(found).toHaveLength(1);
        expect(found[0]).toMatch(/name="email"/);
    });

    it('T98: deny-listed candidate only → no R8', async () => {
        const html =
            '<input type="text" name="search" aria-label="Search">' +
            '<label for="p">Password</label><input id="p" type="password" autocomplete="current-password">';
        expect(await messages(html, 'username-autocomplete')).toEqual([]);
    });

    it('a typeless input counts as a text field for the candidate (reviewer note)', async () => {
        const html =
            '<form><label for="u">User</label><input id="u" name="user">' +
            '<label for="p">Password</label><input id="p" type="password" autocomplete="current-password"></form>';
        const found = await messages(html, 'username-autocomplete');
        expect(found).toEqual([
            '[a11y/username-autocomplete] <input name="user"> is the sign-in name for the password field but has no autocomplete="username" (WCAG 1.3.5)',
        ]);
    });

    it('T42: §5 login "before" gives exactly R1 x2, R7, R8', async () => {
        const html =
            '<form><input type="email" placeholder="Email" /><input type="password" placeholder="Password" /></form>';
        expect(formRuleIds(await validate(makeContext(html)))).toEqual([
            'password-autocomplete',
            'placeholder-as-label',
            'placeholder-as-label',
            'username-autocomplete',
        ]);
    });
});

describe('R9 error-not-associated', () => {
    it('T28: exact finding for the §5 bad fixture', async () => {
        const found = await rule(
            makeContext(
                '<div><label for="zip">Postal code</label><input id="zip" autocomplete="postal-code" value="{zip}" /><span if="zipError">{zipError}</span></div>',
            ),
            'error-not-associated',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/error-not-associated] <span> (1st span in the file) looks like the error for <input id="zip"> but is not linked: missing an id listed in its aria-describedby and an aria-invalid attribute (WCAG 3.3.1, 4.1.2)',
                suggestion:
                    "Give the error a static id, list it in the field's aria-describedby, and bind aria-invalid to the same state." +
                    TAIL('error-not-associated'),
                element: '<span>',
            },
        ]);
    });

    it('T29: the §5 good fixture is clean', async () => {
        expect(
            await messages(
                '<div><label for="zip">Postal code</label><input id="zip" autocomplete="postal-code" value="{zip}" aria-invalid="{zipInvalid}" aria-describedby="zip-err" /><span id="zip-err" if="zipError">{zipError}</span></div>',
                'error-not-associated',
            ),
        ).toEqual([]);
    });

    it('T30 / T31 / T83 / T86: non-error names, summaries, two controls, negations', async () => {
        for (const html of [
            '<div><input aria-label="A"><span if="loading">…</span></div>',
            '<div><input aria-label="A"><input aria-label="B"><p if="errorCount">{errorCount}</p></div>',
            '<div><input aria-label="A"><input aria-label="B"><span if="formError">x</span></div>',
            '<div><input aria-label="A"><span if="!emailError">Looks good</span></div>',
        ]) {
            expect(await messages(html, 'error-not-associated')).toEqual([]);
        }
    });

    it('T84: control found via the grandparent', async () => {
        expect(
            await messages(
                '<div><div><input id="e" aria-label="E"></div><span if="emailError">{emailError}</span></div>',
                'error-not-associated',
            ),
        ).toHaveLength(1);
    });

    it('counts descendants, not only children, of the parent scope (reviewer note)', async () => {
        expect(
            await messages(
                '<div><label>Email <span><input aria-label="E"></span></label><span if="emailError">{emailError}</span></div>',
                'error-not-associated',
            ),
        ).toHaveLength(1);
    });

    it('T85: hasError next to one unlinked input', async () => {
        expect(
            await messages(
                '<div><input aria-label="A"><span if="hasError">Bad</span></div>',
                'error-not-associated',
            ),
        ).toHaveLength(1);
    });

    it('T103: a button is not counted as a control', async () => {
        expect(
            await messages(
                '<p id="x">hint</p><div><input id="e" aria-label="E" aria-describedby="x"><button type="submit">Go</button><span if="emailError">{emailError}</span></div>',
                'error-not-associated',
            ),
        ).toHaveLength(1);
    });
});

describe('R10 css-invalid-early', () => {
    it('T44: exact finding with no marker', async () => {
        const found = await rule(
            makeContext('<div></div>', 'input:invalid{border-color:red}'),
            'css-invalid-early',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/css-invalid-early] selector "input:invalid" in page CSS styles fields as invalid before the user has typed',
                suggestion:
                    'Use :user-invalid, or gate :invalid behind a state class such as .submitted.' +
                    TAIL('css-invalid-early'),
            },
        ]);
    });

    it('T43 / T57 / T59: head style marker wins', async () => {
        for (const css of [
            '/* jay:head-style */\ninput:invalid{border-color:red}',
            '/* External CSS: a.css */\n.x{}\n\n/* jay:head-style */\ninput:invalid{border-color:red}',
            '/* jay:head-style */\n/* @import fake.css */\ninput:invalid{border-color:red}',
        ]) {
            expect(await cssMessages(css, 'css-invalid-early')).toEqual([
                '[a11y/css-invalid-early] selector "input:invalid" in <head> <style> styles fields as invalid before the user has typed',
            ]);
        }
    });

    it('T58: nested @import markers push and pop', async () => {
        const css =
            '/* External CSS: a.css */\n/* jay:@import b.css */\ninput:invalid{color:red}\n/* jay:end-@import b.css */\nselect:invalid{color:red}';
        expect(await cssMessages(css, 'css-invalid-early')).toEqual([
            '[a11y/css-invalid-early] selector "input:invalid" in b.css styles fields as invalid before the user has typed',
            '[a11y/css-invalid-early] selector "select:invalid" in a.css styles fields as invalid before the user has typed',
        ]);
    });

    it('T45: selector lists are split', async () => {
        const found = await cssMessages(
            'input:invalid, input:user-invalid, select:invalid{color:red}',
            'css-invalid-early',
        );
        expect(found.map((m) => /selector "([^"]+)"/.exec(m)?.[1])).toEqual([
            'input:invalid',
            'select:invalid',
        ]);
    });

    it('fires on ungated selectors', async () => {
        for (const css of [
            ':is(input:invalid, .x){color:red}', // T39
            'form:invalid{outline:1px solid red}', // T66
            'input:focus:invalid{color:red}', // T67
            'input:focus-visible:invalid{color:red}', // T67
            ':where(input:invalid){color:red}', // T69
            '.card:has(input:invalid){color:red}', // T71
            '.form-field input:invalid{color:red}', // T54
            '[data-testid] input:invalid{color:red}', // T55
            'input:invalid{box-shadow:none;border-color:red}', // T79
            '.card:has(:invalid) button{opacity:.5}', // T105
        ]) {
            expect(await cssMessages(css, 'css-invalid-early')).toHaveLength(1);
        }
    });

    it('does not fire on gated, allowed or reset selectors', async () => {
        for (const css of [
            'form:invalid button{opacity:.5}', // T38 / T65
            'input:not(:placeholder-shown):invalid{color:red}', // T38
            ':is(input:user-invalid, .x){color:red}', // T38
            '.card.submitted:has(input:invalid){color:red}', // T46
            '/* External CSS: styles/form.css */\n.submitted input:invalid{color:red}', // T52
            'input.touched:invalid{color:red}', // T53
            '[data-state] input:invalid{color:red}', // T53
            '[aria-invalid] :invalid{color:red}', // T53
            '[data-user-touched] input:invalid{color:red}', // T56
            '[data-submitted] :invalid{color:red}', // T56
            'input:user-invalid{color:red}', // T60
            'form:has(:invalid) button{opacity:.5}', // T64
            'fieldset:invalid legend{color:red}', // T64
            'input:not(:invalid){color:green}', // T68
            ':where(.submitted input:invalid){color:red}', // T70
            'input:invalid{box-shadow:none}', // T78
            ':invalid{outline:none}', // T78
            '.submitted :is(input:invalid){color:red}', // T106
        ]) {
            expect(await cssMessages(css, 'css-invalid-early')).toEqual([]);
        }
    });
});

describe('R11 css-autofill-color-only', () => {
    it('T41: exact finding', async () => {
        const found = await rule(
            makeContext('<div></div>', 'input:autofill{border:blue}'),
            'css-autofill-color-only',
        );
        expect(found).toEqual([
            {
                severity: 'warning',
                message:
                    '[a11y/css-autofill-color-only] selector "input:autofill" in page CSS signals autofill with colour only (WCAG 1.4.1)',
                suggestion:
                    "Add a non-colour cue that doesn't shift layout, e.g. box-shadow: inset 0 0 0 2px <colour>." +
                    TAIL('css-autofill-color-only'),
            },
        ]);
    });

    it('fires on colour-only rules', async () => {
        for (const css of [
            'input:autofill{outline:blue}', // T75
            'input:-webkit-autofill{-webkit-text-fill-color:blue}', // T77
        ]) {
            expect(await cssMessages(css, 'css-autofill-color-only')).toHaveLength(1);
        }
    });

    it('T49: one finding per selector in a list', async () => {
        expect(
            await cssMessages(
                'input:autofill, input:-webkit-autofill{border-color:blue}',
                'css-autofill-color-only',
            ),
        ).toHaveLength(2);
    });

    it('T50: merged rule names the first occurrence', async () => {
        expect(
            await cssMessages(
                '/* External CSS: a.css */\ninput:autofill{border-color:blue}\n/* jay:head-style */\ninput:autofill{color:blue}',
                'css-autofill-color-only',
            ),
        ).toEqual([
            '[a11y/css-autofill-color-only] selector "input:autofill" in a.css signals autofill with colour only (WCAG 1.4.1)',
        ]);
    });

    it('T73: different selectors are not merged', async () => {
        const found = await cssMessages(
            'input:autofill{border-color:blue} input:-webkit-autofill{box-shadow:inset 0 0 0 2px blue}',
            'css-autofill-color-only',
        );
        expect(found.map((m) => /selector "([^"]+)"/.exec(m)?.[1])).toEqual(['input:autofill']);
    });

    it('does not fire with a non-colour cue or no relevant declarations', async () => {
        for (const css of [
            'input:autofill{border:2px solid blue}', // T40
            'input:autofill{transition:all 1s}', // T47
            'input:autofill{border-color:blue;border-width:2px}', // T48
            'input:-webkit-autofill{border-color:blue;box-shadow:inset 0 0 0 2px blue}', // T61
            '/* External CSS: a.css */\ninput:autofill{border-color:blue}\n/* jay:head-style */\ninput:autofill{box-shadow:inset 0 0 0 2px blue}', // T72
            'input:autofill{outline:2px solid blue}', // T74
            'input:-webkit-autofill{-webkit-box-shadow:inset 0 0 0 2px blue}', // T76
        ]) {
            expect(await cssMessages(css, 'css-autofill-color-only')).toEqual([]);
        }
    });
});

describe('suppression and guide (T62 / T63)', () => {
    const CASES: Array<[string, string, string?]> = [
        [
            'placeholder-format-hint',
            '<label for="c">Card</label><input id="c" placeholder="MM/YY">',
        ],
        ['describedby-missing-id', '<input aria-label="E" aria-describedby="nope">'],
        ['hint-below-field', '<input aria-label="C" aria-describedby="h"><p id="h">MM/YY</p>'],
        ['autocomplete-invalid', '<input aria-label="X" autocomplete="qwerty">'],
        ['autocomplete-missing', '<label>E <input type="email"></label>'],
        ['password-autocomplete', '<label>P <input type="password"></label>'],
        [
            'username-autocomplete',
            '<form><label>E <input type="email"></label><label>P <input type="password" autocomplete="current-password"></label></form>',
        ],
        ['error-not-associated', '<div><input aria-label="A"><span if="hasError">Bad</span></div>'],
        ['css-invalid-early', '<div></div>', 'input:invalid{color:red}'],
        ['css-autofill-color-only', '<div></div>', 'input:autofill{color:blue}'],
        ['placeholder-as-label', '<input type="text" placeholder="Name">'],
    ];

    for (const [id, html, css] of CASES) {
        it(`${id}: fires with the forms guide, silenced by allow-${id}`, async () => {
            const fired = await rule(makeContext(html, css), id);
            expect(fired).toHaveLength(1);
            expect(fired[0].suggestion?.endsWith('forms-and-autofill.md')).toBe(true);
            expect(await rule(makeContext(html, css, { [`allow-${id}`]: true }), id)).toEqual([]);
        });
    }
});
