# Figma Vendor Test Fixtures

This directory contains fixture-based integration tests for the Figma vendor converter.

## Structure

Each fixture is a directory containing:
- **`page.figma.json`** - Input Figma document (serialized from Figma plugin)
- **`page.jay-contract`** - Contract defining data bindings and structure
- **`expected.jay-html`** - Expected HTML output after conversion

## Current Fixtures

### 1. `basic-text/` ✅ **Working**
Tests basic text rendering with multiple text nodes and font families.

**Features tested:**
- Static text conversion
- Font family collection (Inter)
- Font weight and size
- Text alignment
- Color conversion
- Basic FRAME container with children

---

### 2. `button-with-variants/` ✅ **Working**
Tests variant components with multiple properties.

**Features tested:**
- COMPONENT_SET with variants
- Boolean variants (disabled: true/false)
- Enum variants (variant: primary/secondary)
- Property bindings
- Variant permutation generation
- Conditional rendering with `if` attributes

---

### 3. `repeater-list/` ✅ **Working**
Tests repeater (forEach) functionality with nested bindings.

**Features tested:**
- Frame with repeater binding
- `forEach` attribute generation
- `trackBy` attribute
- Nested data bindings (items.title, items.description)
- Repeater context management
- Sub-contract with repeated items

---

### 4. `complex-page/` ✅ **Working**
Tests a realistic product page with multiple features combined.

**Features tested:**
- Dynamic text content bindings (product.name, product.price)
- Nested repeater (product.reviews)
- Parameterized route (/products/:id)
- Multiple font families (Roboto)
- Complex contract structure with nested sub-contracts

---

## Adding New Fixtures

1. **Create a directory** under `fixtures/`:
   ```bash
   mkdir test/vendors/figma/fixtures/my-new-test
   ```

2. **Add required files**:
   - `page.figma.json` - Figma document structure
   - `expected.jay-html` - Expected HTML output
   - `page.jay-contract` OR `page.conf.yaml` - Contract or plugin config

3. **Add fixture content** - You can:
   - Export a real Figma document using the plugin
   - Hand-craft a test case
   - Copy and modify an existing fixture

4. **Run the test** to generate `actual-output.jay-html`:
   ```bash
   npm test -- test/vendors/figma/fixtures.test.ts -t "my-new-test"
   ```

5. **Review and copy** actual output to `expected.jay-html` if correct

6. **That's it!** The test automatically discovers all fixture directories - no code changes needed!

## Running Tests

Run all fixture tests (auto-discovers all fixture directories):
```bash
npm test -- test/vendors/figma/fixtures.test.ts
```

Run a specific fixture (via filtering):
```bash
npm test -- test/vendors/figma/fixtures.test.ts -t "basic-text"
```

The test runner **automatically discovers** all directories under `fixtures/` - you don't need to manually register new fixtures!

## Tips

### Debugging Failed Tests
When a test fails, check the `actual-output.jay-html` file saved in the fixture directory.

### Contract Requirements
- Use `type: sub-contract` (not `subContract`)
- Include all fields referenced by `trackBy` attributes
- Check console warnings for validation errors

### Normalizing HTML
The test normalizes HTML before comparison to handle:
- Whitespace differences
- Comment removal
- Line break variations

## Test Coverage

Current fixtures cover:
- ✅ Static text rendering (basic-text)
- ✅ Font collection (basic-text)
- ✅ FRAME containers with layout (basic-text)
- ✅ Dynamic content bindings (repeater-list, complex-page, plugin-product-card)
- ✅ Variant components (button-with-variants)
- ✅ Repeaters with trackBy (repeater-list, complex-page)
- ✅ Nested sub-contracts (complex-page)
- ✅ Conditional rendering (button-with-variants)
- ✅ Plugin-based pages (plugin-product-card)
- ✅ Headless components (plugin-product-card)

**Current Status:** 5 fixtures fully working (22 passing tests total in vendor suite)

Missing coverage (potential future fixtures):
- ⬜ Interactive bindings (ref)
- ⬜ Dual bindings (data + interactive)
- ⬜ Error cases (invalid bindings, missing contracts)
- ⬜ Images with dynamic src bindings
- ⬜ Attribute bindings beyond variants
- ⬜ NPM-installed plugins (currently only local plugins tested)
