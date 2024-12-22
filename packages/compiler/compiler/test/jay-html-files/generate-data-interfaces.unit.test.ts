import stripMargin from '@caiogondim/strip-margin';

import {
    JayArrayType,
    JayBoolean,
    JayDate,
    JayNumber,
    JayObjectType,
    JayString,
} from 'jay-compiler-shared';
import {generateTypes} from "../../lib/jay-html-files/jay-target/jay-file-compiler";

describe('generate data interfaces', () => {
    it('should generate simple interface', () => {
        let genInterface = generateTypes(
            new JayObjectType('ElementNameViewState', {
                name: JayString,
                age: JayNumber,
                bool: JayBoolean,
                bdate: JayDate,
            }),
        );
        expect(genInterface).toEqual(
            stripMargin(
                `export interface ElementNameViewState {
                |  name: string,
                |  age: number,
                |  bool: boolean,
                |  bdate: Date
                |}`,
            ),
        );
    });

    it('should generate interface with complex object types', () => {
        let genInterface = generateTypes(
            new JayObjectType('ElementNameViewState', {
                name: JayString,
                address: new JayObjectType('Address', {
                    street: JayString,
                }),
            }),
        );
        expect(genInterface).toEqual(
            stripMargin(
                `export interface Address {
                |  street: string
                |}
                |
                |export interface ElementNameViewState {
                |  name: string,
                |  address: Address
                |}`,
            ),
        );
    });

    it('should generate interface with complex array of object types', () => {
        let genInterface = generateTypes(
            new JayObjectType('ElementNameViewState', {
                name: JayString,
                address: new JayArrayType(
                    new JayObjectType('Address', {
                        street: JayString,
                    }),
                ),
            }),
        );
        expect(genInterface).toEqual(
            stripMargin(
                `export interface Address {
                |  street: string
                |}
                |
                |export interface ElementNameViewState {
                |  name: string,
                |  address: Array<Address>
                |}`,
            ),
        );
    });
});
