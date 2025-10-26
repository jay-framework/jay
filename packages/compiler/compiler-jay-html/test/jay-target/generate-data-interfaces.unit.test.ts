import {
    JayArrayType,
    JayBoolean,
    JayDate,
    JayNumber,
    JayObjectType,
    JayRecursiveType,
    JayString,
    prettify,
} from '@jay-framework/compiler-shared';

import { generateTypes } from '../../lib';

describe('generate data interfaces', () => {
    it('should generate simple interface', async () => {
        let genInterface = generateTypes(
            new JayObjectType('ElementNameViewState', {
                name: JayString,
                age: JayNumber,
                bool: JayBoolean,
                bdate: JayDate,
            }),
        );
        expect(await prettify(genInterface)).toEqual(
            await prettify(`export interface ElementNameViewState {
  name: string,
  age: number,
  bool: boolean,
  bdate: Date
}`),
        );
    });

    it('should generate interface with complex object types', async () => {
        let genInterface = generateTypes(
            new JayObjectType('ElementNameViewState', {
                name: JayString,
                address: new JayObjectType('Address', {
                    street: JayString,
                }),
            }),
        );
        expect(await prettify(genInterface)).toEqual(
            await prettify(`export interface Address {
  street: string
}

export interface ElementNameViewState {
  name: string,
  address: Address
}`),
        );
    });

    it('should generate interface with complex array of object types', async () => {
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
        expect(await prettify(genInterface)).toEqual(
            await prettify(`export interface Address {
  street: string
}

export interface ElementNameViewState {
  name: string,
  address: Array<Address>
}`),
        );
    });

    describe('recursive types', () => {
        it('should generate recursive interface with array recursion', async () => {
            const rootType = new JayObjectType('TreeViewState', {
                name: JayString,
                id: JayString,
                children: new JayArrayType(new JayRecursiveType('$/data')),
            });

            // Resolve the recursive reference
            const childrenArray = rootType.props.children as JayArrayType;
            const recursiveType = childrenArray.itemType as JayRecursiveType;
            recursiveType.resolvedType = rootType;

            let genInterface = generateTypes(rootType);

            expect(await prettify(genInterface)).toEqual(
                await prettify(`export interface TreeViewState {
  name: string,
  id: string,
  children: Array<TreeViewState>
}`),
            );
        });

        it('should generate recursive interface with single optional child', async () => {
            const rootType = new JayObjectType('LinkedListViewState', {
                value: JayString,
                id: JayString,
                next: new JayRecursiveType('$/data'),
            });

            // Resolve the recursive reference
            const recursiveType = rootType.props.next as JayRecursiveType;
            recursiveType.resolvedType = rootType;

            let genInterface = generateTypes(rootType);

            expect(await prettify(genInterface)).toEqual(
                await prettify(`export interface LinkedListViewState {
  value: string,
  id: string,
  next: LinkedListViewState | null
}`),
            );
        });

        it('should generate recursive interface with indirect recursion', async () => {
            const rootType = new JayObjectType('MenuViewState', {
                name: JayString,
                id: JayString,
                submenu: new JayObjectType('SubmenuOfMenuViewState', {
                    title: JayString,
                    items: new JayArrayType(new JayRecursiveType('$/data')),
                }),
            });

            // Resolve the recursive reference
            const submenu = rootType.props.submenu as JayObjectType;
            const items = submenu.props.items as JayArrayType;
            const recursiveType = items.itemType as JayRecursiveType;
            recursiveType.resolvedType = rootType;

            let genInterface = generateTypes(rootType);

            expect(await prettify(genInterface)).toEqual(
                await prettify(`export interface SubmenuOfMenuViewState {
  title: string,
  items: Array<MenuViewState>
}

export interface MenuViewState {
  name: string,
  id: string,
  submenu: SubmenuOfMenuViewState
}`),
            );
        });

        it('should generate recursive interface with multiple optional children', async () => {
            const rootType = new JayObjectType('BinaryTreeViewState', {
                value: JayNumber,
                id: JayString,
                left: new JayRecursiveType('$/data'),
                right: new JayRecursiveType('$/data'),
            });

            // Resolve the recursive references
            const leftRecursive = rootType.props.left as JayRecursiveType;
            leftRecursive.resolvedType = rootType;
            const rightRecursive = rootType.props.right as JayRecursiveType;
            rightRecursive.resolvedType = rootType;

            let genInterface = generateTypes(rootType);

            expect(await prettify(genInterface)).toEqual(
                await prettify(`export interface BinaryTreeViewState {
  value: number,
  id: string,
  left: BinaryTreeViewState | null,
  right: BinaryTreeViewState | null
}`),
            );
        });
    });
});
