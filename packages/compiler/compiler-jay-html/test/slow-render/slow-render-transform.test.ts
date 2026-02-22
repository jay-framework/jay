import { describe, expect, it } from 'vitest';
import {
    slowRenderTransform,
    hasSlowPhaseProperties,
    discoverHeadlessInstances,
    resolveHeadlessInstances,
    SlowRenderInput,
} from '../../lib';
import { parseContract } from '../../lib';
import { Contract } from '../../lib';
import { checkValidationErrors, prettifyHtml } from '@jay-framework/compiler-shared';
import { promises } from 'node:fs';
import path from 'path';

const { readFile } = promises;

// Helper to read fixture files
function fixtureDir(folder: string): string {
    return path.resolve(__dirname, `../fixtures/slow-render/${folder}`);
}

async function readSlowRenderFixture(folder: string): Promise<{
    input: string;
    slowViewState: Record<string, unknown>;
    contract: Contract;
    expectedOutput: string;
}> {
    const dir = fixtureDir(folder);
    const [input, slowViewState, contractYaml, expectedOutput] = await Promise.all([
        readFile(path.join(dir, 'input.jay-html'), 'utf-8'),
        readFile(path.join(dir, 'slow-view-state.json'), 'utf-8').then(JSON.parse),
        readFile(path.join(dir, 'contract.yaml'), 'utf-8'),
        readFile(path.join(dir, 'expected-output.jay-html'), 'utf-8'),
    ]);
    const contract = checkValidationErrors(parseContract(contractYaml, 'contract.yaml'));
    return { input, slowViewState, contract, expectedOutput };
}

async function runSlowRenderTest(folder: string) {
    const fixture = await readSlowRenderFixture(folder);
    const input: SlowRenderInput = {
        jayHtmlContent: fixture.input,
        slowViewState: fixture.slowViewState,
        contract: fixture.contract,
    };

    const result = slowRenderTransform(input);
    expect(result.validations).toEqual([]);
    expect(prettifyHtml(result.val!.preRenderedJayHtml)).toEqual(
        prettifyHtml(fixture.expectedOutput),
    );
}

describe('Slow Render Transform', () => {
    describe('Text Binding Resolution', () => {
        it('should resolve simple slow text bindings', async () => {
            await runSlowRenderTest('text-bindings');
        });

        it('should preserve fast phase bindings', async () => {
            await runSlowRenderTest('fast-bindings-preserved');
        });

        it('should handle mixed text with multiple bindings', async () => {
            await runSlowRenderTest('mixed-text-bindings');
        });
    });

    describe('Attribute Binding Resolution', () => {
        it('should resolve slow bindings in attributes', async () => {
            await runSlowRenderTest('attribute-slow-bindings');
        });

        it('should preserve fast bindings in attributes', async () => {
            await runSlowRenderTest('attribute-fast-preserved');
        });
    });

    describe('Style Binding Resolution', () => {
        it('should resolve slow bindings in style attributes', async () => {
            await runSlowRenderTest('style-bindings');
        });
    });

    describe('Conditional (if) Handling', () => {
        it('should remove element when slow condition is false', async () => {
            await runSlowRenderTest('conditional-false');
        });

        it('should keep element and remove if when slow condition is true', async () => {
            await runSlowRenderTest('conditional-true');
        });

        it('should preserve fast conditionals', async () => {
            await runSlowRenderTest('conditional-fast-preserved');
        });

        it('should handle negated slow conditionals inside forEach', async () => {
            await runSlowRenderTest('conditional-negated-in-foreach');
        });

        it('should handle complex conditions with logical operators and comparisons', async () => {
            await runSlowRenderTest('conditional-complex');
        });

        it('should resolve slow enum comparisons (e.g., productType == PHYSICAL)', async () => {
            await runSlowRenderTest('conditional-enum-comparison');
        });
    });

    describe('forEach Array Unrolling', () => {
        it('should unroll slow arrays with slowForEach', async () => {
            await runSlowRenderTest('foreach-unrolling');
        });

        it('should handle mixed-phase arrays (slow array with fast properties)', async () => {
            await runSlowRenderTest('foreach-mixed-phase');
        });

        it('should preserve fast arrays', async () => {
            await runSlowRenderTest('foreach-fast-preserved');
        });
    });

    describe('Component and Recursive Handling', () => {
        it('should preserve recursive regions with fast phase data', async () => {
            await runSlowRenderTest('recursive-preserved');
        });

        it('should preserve headless component references and resolve slow bindings', async () => {
            await runSlowRenderTest('headless-preserved');
        });

        it('should preserve bindings when headless plugin has no slow data (withInteractive only)', () => {
            const headlessContractYaml = `
name: product
tags:
  - tag: name
    type: data
    dataType: string
  - tag: mediaType
    type: variant
    dataType: 'enum(IMAGE | VIDEO)'
  - tag: options
    type: sub-contract
    repeated: true
    trackBy: id
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: label
        type: data
        dataType: string
`;
            const headlessContract = checkValidationErrors(
                parseContract(headlessContractYaml, 'product.jay-contract'),
            );

            const input: SlowRenderInput = {
                jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
  <script type="application/jay-headless" plugin="product-data" contract="product" key="product"></script>
</head>
<body>
  <div if="product.mediaType == IMAGE">Image</div>
  <div if="product.mediaType == VIDEO">Video</div>
  <div>{product.name}</div>
  <div forEach="product.options" trackBy="id">
    <span>{label}</span>
  </div>
</body>
</html>`,
                slowViewState: {},
                headlessContracts: [
                    {
                        key: 'product',
                        contract: headlessContract,
                    },
                ],
            };

            const result = slowRenderTransform(input);
            expect(result.validations).toEqual([]);

            const html = prettifyHtml(result.val!.preRenderedJayHtml);
            // == is normalized to === by the expression parser, which is correct for runtime evaluation
            expect(html).toContain('if="product.mediaType === IMAGE"');
            expect(html).toContain('if="product.mediaType === VIDEO"');
            expect(html).toContain('{product.name}');
            expect(html).toContain('forEach="product.options"');
            expect(html).not.toContain('="undefined');
        });
    });
});

describe('hasSlowPhaseProperties', () => {
    it('should return true when contract has slow properties', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: title
    type: data
    dataType: string
    phase: slow
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(true);
    });

    it('should return true when contract has properties without explicit phase (defaults to slow)', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: title
    type: data
    dataType: string
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(true);
    });

    it('should return false when all properties are fast or interactive', () => {
        const contractYaml = `
name: TestContract
tags:
  - tag: count
    type: data
    dataType: number
    phase: fast
  - tag: selected
    type: data
    dataType: boolean
    phase: fast+interactive
`;
        const result = parseContract(contractYaml, 'test.jay-contract');
        expect(hasSlowPhaseProperties(result.val)).toBe(false);
    });

    it('should return false for undefined contract', () => {
        expect(hasSlowPhaseProperties(undefined)).toBe(false);
    });
});

describe('Relative Path Resolution', () => {
    it('should resolve relative contract paths to absolute when sourceDir is provided', () => {
        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
</head>
<body><h1>{title}</h1></body>
</html>`,
            slowViewState: { title: 'Test' },
            sourceDir: '/project/src/pages/home',
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);
        expect(result.val!.preRenderedJayHtml).toContain(
            'contract="/project/src/pages/home/page.jay-contract"',
        );
    });

    it('should resolve relative headless component paths to absolute', () => {
        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" src="./header.ts"></script>
</head>
<body><h1>Test</h1></body>
</html>`,
            slowViewState: {},
            sourceDir: '/project/src/pages/home',
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);
        expect(result.val!.preRenderedJayHtml).toContain('src="/project/src/pages/home/header.ts"');
    });

    it('should resolve relative CSS link paths to absolute', () => {
        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="./styles.css">
</head>
<body><h1>Test</h1></body>
</html>`,
            slowViewState: {},
            sourceDir: '/project/src/pages/home',
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);
        expect(result.val!.preRenderedJayHtml).toContain(
            'href="/project/src/pages/home/styles.css"',
        );
    });

    it('should not modify paths when sourceDir is not provided', () => {
        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
</head>
<body><h1>Test</h1></body>
</html>`,
            slowViewState: {},
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);
        expect(result.val!.preRenderedJayHtml).toContain('contract="./page.jay-contract"');
    });

    it('should not modify absolute paths', () => {
        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-data" contract="/absolute/path/page.jay-contract"></script>
</head>
<body><h1>Test</h1></body>
</html>`,
            slowViewState: {},
            sourceDir: '/project/src/pages/home',
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);
        expect(result.val!.preRenderedJayHtml).toContain(
            'contract="/absolute/path/page.jay-contract"',
        );
    });
});

describe('Headless Contract Support', () => {
    it('should resolve bindings from headless contracts', () => {
        // Simulate a headless component with its own contract
        const headlessContract = checkValidationErrors(
            parseContract(
                `
name: product-search
tags:
  - tag: category-name
    type: data
    dataType: string
  - tag: is-searching
    type: variant
    dataType: boolean
    phase: fast+interactive
`,
                'product-search.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="test-plugin" contract="product-search" key="productSearch"></script>
</head>
<body>
    <div>
        <span>{productSearch.categoryName}</span>
        <span>{productSearch.isSearching}</span>
    </div>
</body>
</html>`,
            slowViewState: {
                productSearch: {
                    categoryName: 'Electronics',
                    isSearching: false,
                },
            },
            headlessContracts: [
                {
                    key: 'productSearch',
                    contract: headlessContract,
                },
            ],
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);

        // categoryName is slow (default) - should be resolved
        expect(result.val!.preRenderedJayHtml).toContain('>Electronics</span>');

        // isSearching is fast+interactive - should be preserved as binding
        expect(result.val!.preRenderedJayHtml).toContain('{productSearch.isSearching}');
    });

    it('should resolve bindings in forEach from headless contracts', () => {
        const headlessContract = checkValidationErrors(
            parseContract(
                `
name: product-search
tags:
  - tag: categories
    type: sub-contract
    repeated: true
    trackBy: id
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: name
        type: data
        dataType: string
`,
                'product-search.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head></head>
<body>
    <div forEach="productSearch.categories" trackBy="id">
        <span>{name}</span>
    </div>
</body>
</html>`,
            slowViewState: {
                productSearch: {
                    categories: [
                        { id: 'cat1', name: 'Electronics' },
                        { id: 'cat2', name: 'Clothing' },
                    ],
                },
            },
            headlessContracts: [
                {
                    key: 'productSearch',
                    contract: headlessContract,
                },
            ],
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);

        // forEach should be unrolled and names should be resolved
        expect(result.val!.preRenderedJayHtml).toContain('>Electronics</span>');
        expect(result.val!.preRenderedJayHtml).toContain('>Clothing</span>');
        expect(result.val!.preRenderedJayHtml).toContain('slowForEach="productSearch.categories"');
    });

    it('should resolve nested sub-contract bindings in forEach from headless contracts', () => {
        const headlessContract = checkValidationErrors(
            parseContract(
                `
name: products
tags:
  - tag: items
    type: sub-contract
    repeated: true
    trackBy: id
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: image
        type: sub-contract
        tags:
          - tag: url
            type: data
            dataType: string
          - tag: altText
            type: data
            dataType: string
`,
                'products.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<head></head>
<body>
    <div forEach="products.items" trackBy="id">
        <img src="{image.url}" alt="{image.altText}" />
    </div>
</body>
</html>`,
            slowViewState: {
                products: {
                    items: [
                        {
                            id: 'prod1',
                            image: {
                                url: 'https://example.com/image1.jpg',
                                altText: 'Product 1 image',
                            },
                        },
                        {
                            id: 'prod2',
                            image: {
                                url: 'https://example.com/image2.jpg',
                                altText: 'Product 2 image',
                            },
                        },
                    ],
                },
            },
            headlessContracts: [
                {
                    key: 'products',
                    contract: headlessContract,
                },
            ],
        };

        const result = slowRenderTransform(input);
        expect(result.validations).toEqual([]);

        // forEach should be unrolled and nested image.url and image.altText should be resolved
        expect(result.val!.preRenderedJayHtml).toContain('src="https://example.com/image1.jpg"');
        expect(result.val!.preRenderedJayHtml).toContain('alt="Product 1 image"');
        expect(result.val!.preRenderedJayHtml).toContain('src="https://example.com/image2.jpg"');
        expect(result.val!.preRenderedJayHtml).toContain('alt="Product 2 image"');
        expect(result.val!.preRenderedJayHtml).toContain('slowForEach="products.items"');

        // Verify that bindings are actually resolved (not still present as bindings)
        expect(result.val!.preRenderedJayHtml).not.toContain('{image.url}');
        expect(result.val!.preRenderedJayHtml).not.toContain('{image.altText}');
    });
});

describe('Missing Slow-Phase Data Handling', () => {
    /**
     * Expected Behavior for Missing Slow-Phase Data:
     *
     * When a slow-phase binding references a field that is undefined or null in the data:
     * 1. A validation error is added (fails the build)
     * 2. The binding is replaced with "undefined" string (makes issue visible in output)
     *
     * This distinguishes between truly missing values (undefined/null) and valid
     * falsy values (0, '', false) which should be rendered normally.
     *
     * Rationale:
     * - Missing slow-phase data is a data-layer bug that should fail the build
     * - Rendering "undefined" makes the issue visible during development
     * - Valid falsy values like 0 or '' should work correctly
     */

    it('should fail validation and render "undefined" for undefined slow-phase field', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: title
    type: data
    dataType: string
  - tag: description
    type: data
    dataType: string
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html>
<html>
<body>
    <h1>{title}</h1>
    <p>{description}</p>
</body>
</html>`,
            slowViewState: {
                title: 'Hello World',
                // description is undefined (missing from data)
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // Should have validation error for missing field
        expect(result.validations.length).toBe(1);
        expect(result.validations[0]).toContain('description');
        expect(result.validations[0]).toContain('undefined');

        // title should be resolved
        expect(result.val!.preRenderedJayHtml).toContain('<h1>Hello World</h1>');

        // description should be "undefined", NOT left as {description}
        expect(result.val!.preRenderedJayHtml).toContain('<p>undefined</p>');
        expect(result.val!.preRenderedJayHtml).not.toContain('{description}');
    });

    it('should fail validation and render "undefined" for null slow-phase field', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: subtitle
    type: data
    dataType: string
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html><html><body><span>{subtitle}</span></body></html>`,
            slowViewState: {
                subtitle: null,
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // Should have validation error for null field
        expect(result.validations.length).toBe(1);
        expect(result.validations[0]).toContain('subtitle');
        expect(result.validations[0]).toContain('null');

        // null should be replaced with "undefined"
        expect(result.val!.preRenderedJayHtml).toContain('<span>undefined</span>');
        expect(result.val!.preRenderedJayHtml).not.toContain('{subtitle}');
    });

    it('should fail validation and render "undefined" for missing nested sub-contract field', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: author
    type: sub-contract
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: bio
        type: data
        dataType: string
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html><html><body>
    <span class="name">{author.name}</span>
    <span class="bio">{author.bio}</span>
</body></html>`,
            slowViewState: {
                author: {
                    name: 'Jane Doe',
                    // bio is missing
                },
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // Should have validation error for missing nested field
        expect(result.validations.length).toBe(1);
        expect(result.validations[0]).toContain('author.bio');

        expect(result.val!.preRenderedJayHtml).toContain('<span class="name">Jane Doe</span>');
        expect(result.val!.preRenderedJayHtml).toContain('<span class="bio">undefined</span>');
        expect(result.val!.preRenderedJayHtml).not.toContain('{author.bio}');
    });

    it('should fail validation and render "undefined" for missing fields in forEach items', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: items
    type: sub-contract
    repeated: true
    trackBy: id
    tags:
      - tag: id
        type: data
        dataType: string
      - tag: title
        type: data
        dataType: string
      - tag: subtitle
        type: data
        dataType: string
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html><html><body>
<ul>
    <li forEach="items" trackBy="id">
        <h2>{title}</h2>
        <p>{subtitle}</p>
    </li>
</ul>
</body></html>`,
            slowViewState: {
                items: [
                    { id: '1', title: 'Item 1', subtitle: 'Subtitle 1' },
                    { id: '2', title: 'Item 2' }, // subtitle missing
                    { id: '3', title: 'Item 3', subtitle: null }, // subtitle null
                ],
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // Should have 2 validation errors (item 2 missing, item 3 null)
        expect(result.validations.length).toBe(2);
        expect(
            result.validations.some((v) => v.includes('subtitle') && v.includes('undefined')),
        ).toBe(true);
        expect(result.validations.some((v) => v.includes('subtitle') && v.includes('null'))).toBe(
            true,
        );

        const html = result.val!.preRenderedJayHtml;

        // First item - both present
        expect(html).toContain('<h2>Item 1</h2>');
        expect(html).toContain('<p>Subtitle 1</p>');

        // Second item - subtitle missing, should be "undefined"
        expect(html).toContain('<h2>Item 2</h2>');

        // Third item - subtitle null, should be "undefined"
        expect(html).toContain('<h2>Item 3</h2>');

        // Should have "undefined" rendered for missing subtitles
        expect(html).toContain('<p>undefined</p>');

        // No binding placeholders should remain
        expect(html).not.toContain('{title}');
        expect(html).not.toContain('{subtitle}');
    });

    it('should fail validation and render "undefined" for missing image sub-contract', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: product
    type: sub-contract
    tags:
      - tag: name
        type: data
        dataType: string
      - tag: image
        type: sub-contract
        tags:
          - tag: url
            type: data
            dataType: string
          - tag: altText
            type: data
            dataType: string
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html><html><body>
    <h1>{product.name}</h1>
    <img src="{product.image.url}" alt="{product.image.altText}" />
</body></html>`,
            slowViewState: {
                product: {
                    name: 'Widget',
                    // image is entirely missing
                },
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // Should have 2 validation errors (url and altText both missing)
        expect(result.validations.length).toBe(2);
        expect(result.validations.some((v) => v.includes('product.image.url'))).toBe(true);
        expect(result.validations.some((v) => v.includes('product.image.altText'))).toBe(true);

        const html = result.val!.preRenderedJayHtml;

        expect(html).toContain('<h1>Widget</h1>');
        // Missing nested object should result in "undefined" attributes
        expect(html).toContain('src="undefined"');
        expect(html).toContain('alt="undefined"');
        // Key assertion: binding placeholders should NOT remain
        expect(html).not.toContain('{product.image.url}');
        expect(html).not.toContain('{product.image.altText}');
    });

    it('should correctly render valid falsy values (0, empty string, false)', () => {
        const contract = checkValidationErrors(
            parseContract(
                `
name: TestContract
tags:
  - tag: count
    type: data
    dataType: number
  - tag: label
    type: data
    dataType: string
  - tag: isActive
    type: data
    dataType: boolean
`,
                'test.jay-contract',
            ),
        );

        const input: SlowRenderInput = {
            jayHtmlContent: `<!DOCTYPE html><html><body>
    <span class="count">{count}</span>
    <span class="label">{label}</span>
    <span class="active">{isActive}</span>
</body></html>`,
            slowViewState: {
                count: 0, // valid falsy value
                label: '', // valid falsy value (empty string)
                isActive: false, // valid falsy value
            },
            contract,
        };

        const result = slowRenderTransform(input);

        // No validation errors - these are valid falsy values, not missing data
        expect(result.validations).toEqual([]);

        const html = result.val!.preRenderedJayHtml;

        // All values should be rendered correctly
        expect(html).toContain('<span class="count">0</span>');
        expect(html).toContain('<span class="label"></span>');
        expect(html).toContain('<span class="active">false</span>');

        // No binding placeholders should remain
        expect(html).not.toContain('{count}');
        expect(html).not.toContain('{label}');
        expect(html).not.toContain('{isActive}');
    });
});

describe('Headless Instance Discovery and Resolution (Two-Pass Pipeline)', () => {
    const productCardContract = checkValidationErrors(
        parseContract(
            `
name: product-card
tags:
  - tag: name
    type: data
    dataType: string
  - tag: price
    type: data
    dataType: string
  - tag: stock-count
    type: data
    dataType: number
    phase: fast+interactive
  - tag: add to cart
    type: interactive
    elementType: HTMLButtonElement
`,
            'product-card.jay-contract',
        ),
    );

    describe('discoverHeadlessInstances', () => {
        it('should discover instances with static props and correct coordinates', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
</head>
<body>
    <jay:product-card productId="prod-123">
        <h2>{name}</h2>
        <span>{price}</span>
    </jay:product-card>
    <jay:product-card productId="prod-456">
        <h2>{name}</h2>
        <span>{price}</span>
    </jay:product-card>
</body>
</html>`;

            const { instances } = discoverHeadlessInstances(jayHtml);

            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123' },
                    coordinate: ['product-card:0'],
                },
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-456' },
                    coordinate: ['product-card:1'],
                },
            ]);
        });

        it('should skip instances inside preserved forEach (fast phase)', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-static">
        <h2>{name}</h2>
    </jay:product-card>
    <div forEach="products" trackBy="_id">
        <jay:product-card productId="{_id}">
            <h2>{name}</h2>
        </jay:product-card>
    </div>
</body>
</html>`;

            const { instances } = discoverHeadlessInstances(jayHtml);

            // Only the static instance should be discovered (not the one inside forEach)
            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-static' },
                    coordinate: ['product-card:0'],
                },
            ]);
        });

        it('should skip instances with unresolved prop bindings', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-123">
        <h2>{name}</h2>
    </jay:product-card>
    <jay:product-card productId="{dynamicId}">
        <h2>{name}</h2>
    </jay:product-card>
</body>
</html>`;

            const { instances } = discoverHeadlessInstances(jayHtml);

            // Only the first instance (second has unresolved binding)
            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123' },
                    coordinate: ['product-card:0'],
                },
            ]);
        });

        it('should discover instances after slow forEach unrolling with trackBy coordinates', () => {
            // Simulate Pass 1 output: forEach was unrolled into slowForEach items
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <div slowForEach="products" jayIndex="0" jayTrackBy="p1">
        <jay:product-card productId="prod-123">
            <h2>{name}</h2>
        </jay:product-card>
    </div>
    <div slowForEach="products" jayIndex="1" jayTrackBy="p2">
        <jay:product-card productId="prod-456">
            <h2>{name}</h2>
        </jay:product-card>
    </div>
</body>
</html>`;

            const { instances } = discoverHeadlessInstances(jayHtml);

            // Coordinates include the parent slowForEach jayTrackBy
            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123' },
                    coordinate: ['p1', 'product-card:0'],
                },
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-456' },
                    coordinate: ['p2', 'product-card:0'],
                },
            ]);
        });

        it('should camelCase prop names', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card product-id="prod-123" category-name="electronics">
        <h2>{name}</h2>
    </jay:product-card>
</body>
</html>`;

            const { instances } = discoverHeadlessInstances(jayHtml);

            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123', categoryName: 'electronics' },
                    coordinate: ['product-card:0'],
                },
            ]);
        });
    });

    describe('resolveHeadlessInstances', () => {
        // Helper: run discovery first to embed ref attributes, then resolve
        function discoverAndResolve(
            jayHtml: string,
            instanceData: Parameters<typeof resolveHeadlessInstances>[1],
            importResolver?: Parameters<typeof resolveHeadlessInstances>[2],
        ) {
            const { preRenderedJayHtml } = discoverHeadlessInstances(jayHtml);
            return resolveHeadlessInstances(preRenderedJayHtml, instanceData, importResolver);
        }

        it('should resolve slow bindings inside headless instances', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
</head>
<body>
    <jay:product-card productId="prod-123">
        <h2>{name}</h2>
        <span class="price">{price}</span>
    </jay:product-card>
</body>
</html>`;

            const result = discoverAndResolve(jayHtml, [
                {
                    coordinate: ['product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget A', price: '$29.99' },
                },
            ]);

            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
</head>
<body>
    <jay:product-card productId="prod-123" ref="0">
        <h2>Widget A</h2>
        <span class="price">$29.99</span>
    </jay:product-card>
</body>
</html>`),
            );
        });

        it('should preserve fast/interactive bindings inside headless instances', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-123">
        <h2>{name}</h2>
        <span class="stock">{stockCount}</span>
    </jay:product-card>
</body>
</html>`;

            const result = discoverAndResolve(jayHtml, [
                {
                    coordinate: ['product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget A' },
                },
            ]);

            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-123" ref="0">
        <h2>Widget A</h2>
        <span class="stock">{stockCount}</span>
    </jay:product-card>
</body>
</html>`),
            );
        });

        it('should resolve multiple instances by coordinate', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-123">
        <h2>{name}</h2>
    </jay:product-card>
    <jay:product-card productId="prod-456">
        <h2>{name}</h2>
    </jay:product-card>
</body>
</html>`;

            const result = discoverAndResolve(jayHtml, [
                {
                    coordinate: ['product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget A' },
                },
                {
                    coordinate: ['product-card:1'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget B' },
                },
            ]);

            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-123" ref="0">
        <h2>Widget A</h2>
    </jay:product-card>
    <jay:product-card productId="prod-456" ref="1">
        <h2>Widget B</h2>
    </jay:product-card>
</body>
</html>`),
            );
        });

        it('should resolve instances after slow forEach unrolling using trackBy coordinates', () => {
            // Simulate Pass 1 output: forEach was unrolled
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <div slowForEach="products" jayIndex="0" jayTrackBy="p1">
        <jay:product-card productId="prod-123">
            <h2>{name}</h2>
            <span>{price}</span>
        </jay:product-card>
    </div>
    <div slowForEach="products" jayIndex="1" jayTrackBy="p2">
        <jay:product-card productId="prod-456">
            <h2>{name}</h2>
            <span>{price}</span>
        </jay:product-card>
    </div>
</body>
</html>`;

            const result = discoverAndResolve(jayHtml, [
                {
                    coordinate: ['p1', 'product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget A', price: '$29.99' },
                },
                {
                    coordinate: ['p2', 'product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Widget B', price: '$49.99' },
                },
            ]);

            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head></head>
<body>
    <div slowForEach="products" jayIndex="0" jayTrackBy="p1">
        <jay:product-card productId="prod-123" ref="0">
            <h2>Widget A</h2>
            <span>$29.99</span>
        </jay:product-card>
    </div>
    <div slowForEach="products" jayIndex="1" jayTrackBy="p2">
        <jay:product-card productId="prod-456" ref="0">
            <h2>Widget B</h2>
            <span>$49.99</span>
        </jay:product-card>
    </div>
</body>
</html>`),
            );
        });

        it('should skip instances inside preserved forEach', () => {
            const jayHtml = `<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-static">
        <h2>{name}</h2>
    </jay:product-card>
    <div forEach="products" trackBy="_id">
        <jay:product-card productId="{_id}">
            <h2>{name}</h2>
        </jay:product-card>
    </div>
</body>
</html>`;

            const result = discoverAndResolve(jayHtml, [
                {
                    coordinate: ['product-card:0'],
                    contract: productCardContract,
                    slowViewState: { name: 'Static Widget' },
                },
            ]);

            expect(result.validations).toEqual([]);
            expect(prettifyHtml(result.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head></head>
<body>
    <jay:product-card productId="prod-static" ref="0">
        <h2>Static Widget</h2>
    </jay:product-card>
    <div forEach="products" trackBy="_id">
        <jay:product-card productId="{_id}">
            <h2>{name}</h2>
        </jay:product-card>
    </div>
</body>
</html>`),
            );
        });

        it('full two-pass pipeline: page bindings + instance bindings', () => {
            // Step 1: Page has a slow title + a headless instance
            const pageContract = checkValidationErrors(
                parseContract(
                    `
name: MyPage
tags:
  - tag: page-title
    type: data
    dataType: string
    phase: slow
`,
                    'page.jay-contract',
                ),
            );

            const input: SlowRenderInput = {
                jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
</head>
<body>
    <h1>{pageTitle}</h1>
    <jay:product-card productId="prod-123">
        <article>
            <h2>{name}</h2>
            <span class="price">{price}</span>
            <span class="stock">{stockCount}</span>
        </article>
    </jay:product-card>
</body>
</html>`,
                slowViewState: { pageTitle: 'Our Products' },
                contract: pageContract,
            };

            // Pass 1: resolve page bindings
            const pass1 = slowRenderTransform(input);
            expect(pass1.validations).toEqual([]);
            const pass1Html = pass1.val!.preRenderedJayHtml;

            // Discover instances (also embeds ref attributes)
            const { instances, preRenderedJayHtml: discoveredHtml } =
                discoverHeadlessInstances(pass1Html);
            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123' },
                    coordinate: ['product-card:0'],
                },
            ]);

            // Pass 2: resolve instance bindings using discovered coordinate
            const pass2 = resolveHeadlessInstances(discoveredHtml, [
                {
                    coordinate: instances[0].coordinate,
                    contract: productCardContract,
                    slowViewState: { name: 'Ceramic Vase', price: '$34.99' },
                },
            ]);

            expect(pass2.validations).toEqual([]);
            expect(prettifyHtml(pass2.val!)).toEqual(
                prettifyHtml(`<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
    <script type="application/jay-data" contract="./page.jay-contract"></script>
</head>
<body>
    <h1>Our Products</h1>
    <jay:product-card productId="prod-123" ref="0">
        <article>
            <h2>Ceramic Vase</h2>
            <span class="price">$34.99</span>
            <span class="stock">{stockCount}</span>
        </article>
    </jay:product-card>
</body>
</html>`),
            );
        });

        it('full two-pass pipeline with slow forEach unrolling', () => {
            // Page has a slow products array with product-card instances inside
            const pageContract = checkValidationErrors(
                parseContract(
                    `
name: CatalogPage
tags:
  - tag: products
    type: sub-contract
    repeated: true
    trackBy: _id
    tags:
      - tag: _id
        type: data
        dataType: string
`,
                    'catalog.jay-contract',
                ),
            );

            const input: SlowRenderInput = {
                jayHtmlContent: `<!DOCTYPE html>
<html>
<head>
    <script type="application/jay-headless" plugin="wix-stores" contract="product-card"></script>
</head>
<body>
    <div class="grid" forEach="products" trackBy="_id">
        <jay:product-card productId="{_id}">
            <h2>{name}</h2>
            <span>{price}</span>
        </jay:product-card>
    </div>
</body>
</html>`,
                slowViewState: {
                    products: [{ _id: 'prod-123' }, { _id: 'prod-456' }],
                },
                contract: pageContract,
            };

            // Pass 1: resolve page bindings and unroll forEach
            const pass1 = slowRenderTransform(input);
            expect(pass1.validations).toEqual([]);
            const pass1Html = pass1.val!.preRenderedJayHtml;

            // Discover instances — coordinates include jayTrackBy from forEach
            const { instances, preRenderedJayHtml: discoveredHtml } =
                discoverHeadlessInstances(pass1Html);
            expect(instances).toEqual([
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-123' },
                    coordinate: ['prod-123', 'product-card:0'],
                },
                {
                    contractName: 'product-card',
                    props: { productId: 'prod-456' },
                    coordinate: ['prod-456', 'product-card:0'],
                },
            ]);

            // Pass 2: resolve instance bindings using discovered coordinates
            const pass2 = resolveHeadlessInstances(discoveredHtml, [
                {
                    coordinate: instances[0].coordinate,
                    contract: productCardContract,
                    slowViewState: { name: 'Ceramic Vase', price: '$34.99' },
                },
                {
                    coordinate: instances[1].coordinate,
                    contract: productCardContract,
                    slowViewState: { name: 'Glass Bowl', price: '$19.99' },
                },
            ]);

            expect(pass2.validations).toEqual([]);
            const finalHtml = prettifyHtml(pass2.val!);

            // Both instances resolved with correct data
            expect(finalHtml).toContain('Ceramic Vase');
            expect(finalHtml).toContain('$34.99');
            expect(finalHtml).toContain('Glass Bowl');
            expect(finalHtml).toContain('$19.99');
            // No unresolved component bindings
            expect(finalHtml).not.toContain('{name}');
            expect(finalHtml).not.toContain('{price}');
        });
    });
});
