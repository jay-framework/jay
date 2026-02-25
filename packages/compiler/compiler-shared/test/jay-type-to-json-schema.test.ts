import { describe, it, expect } from 'vitest';
import {
    jayTypeToJsonSchema,
    JayAtomicType,
    JayEnumType,
    JayObjectType,
    JayArrayType,
    JayImportedType,
    JayOptionalType,
    JayUnknown,
} from '../lib';

describe('jayTypeToJsonSchema', () => {
    it('should convert string atomic type', () => {
        expect(jayTypeToJsonSchema(new JayAtomicType('string'))).toEqual({ type: 'string' });
    });

    it('should convert number atomic type', () => {
        expect(jayTypeToJsonSchema(new JayAtomicType('number'))).toEqual({ type: 'number' });
    });

    it('should convert boolean atomic type', () => {
        expect(jayTypeToJsonSchema(new JayAtomicType('boolean'))).toEqual({ type: 'boolean' });
    });

    it('should convert enum type', () => {
        expect(jayTypeToJsonSchema(new JayEnumType('status', ['active', 'inactive']))).toEqual({
            type: 'string',
            enum: ['active', 'inactive'],
        });
    });

    it('should convert array of primitives', () => {
        expect(jayTypeToJsonSchema(new JayArrayType(new JayAtomicType('string')))).toEqual({
            type: 'array',
            items: { type: 'string' },
        });
    });

    it('should convert imported type as generic object', () => {
        expect(jayTypeToJsonSchema(new JayImportedType('ProductCard', JayUnknown))).toEqual({
            type: 'object',
            description: 'Contract: ProductCard',
        });
    });

    it('should unwrap optional type', () => {
        expect(jayTypeToJsonSchema(new JayOptionalType(new JayAtomicType('string')))).toEqual({
            type: 'string',
        });
    });

    it('should convert object with required and optional props', () => {
        const objType = new JayObjectType('Input', {
            query: new JayAtomicType('string'),
            limit: new JayOptionalType(new JayAtomicType('number')),
        });

        expect(jayTypeToJsonSchema(objType)).toEqual({
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
            },
            required: ['query'],
        });
    });

    it('should convert nested object', () => {
        const inner = new JayObjectType('Filter', {
            field: new JayAtomicType('string'),
        });
        const outer = new JayObjectType('Input', {
            filter: inner,
        });

        expect(jayTypeToJsonSchema(outer)).toEqual({
            type: 'object',
            properties: {
                filter: {
                    type: 'object',
                    properties: {
                        field: { type: 'string' },
                    },
                    required: ['field'],
                },
            },
            required: ['filter'],
        });
    });

    it('should convert array of objects', () => {
        const itemType = new JayObjectType('Product', {
            name: new JayAtomicType('string'),
            price: new JayAtomicType('number'),
        });

        expect(jayTypeToJsonSchema(new JayArrayType(itemType))).toEqual({
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    price: { type: 'number' },
                },
                required: ['name', 'price'],
            },
        });
    });

    it('should omit required array when all props are optional', () => {
        const objType = new JayObjectType('Options', {
            limit: new JayOptionalType(new JayAtomicType('number')),
            offset: new JayOptionalType(new JayAtomicType('number')),
        });

        const result = jayTypeToJsonSchema(objType);
        expect(result).toEqual({
            type: 'object',
            properties: {
                limit: { type: 'number' },
                offset: { type: 'number' },
            },
        });
        expect(result!.required).toBeUndefined();
    });
});
