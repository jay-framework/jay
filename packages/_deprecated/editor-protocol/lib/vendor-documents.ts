/**
 * Vendor Document Types
 *
 * This file defines the document types that each vendor expects when
 * calling the export API. Editor plugins should import these types
 * to ensure they send the correct format.
 *
 * Each vendor is responsible for defining and exporting their document type.
 */

// Export FigmaVendorDocument document type
export type { FigmaVendorDocument } from './vendors/figma';
