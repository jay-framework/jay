/**
 * Runtime validation for rendering manifests
 */

import {
  RenderingManifestSchema,
  SchemaNode,
  ArraySchemaNode,
  RenderingMode,
} from './rendering-manifest';

export interface ValidationError {
  path: string;
  rule: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Runtime validation of manifest constraints
 */
export class ManifestValidator {
  /**
   * Validate that a manifest satisfies all rules
   */
  static validateManifest<ViewState extends object>(
    manifest: RenderingManifestSchema<ViewState>
  ): ValidationResult {
    const errors: ValidationError[] = [];

    for (const [key, node] of Object.entries(manifest)) {
      if (node) {
        errors.push(...this.validateNode(key, node, undefined));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private static validateNode(
    key: string,
    node: SchemaNode,
    parentMode?: RenderingMode
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Objects don't have a mode property - skip mode validation for them
    if (node.type !== 'object') {
      const nodeMode = 'mode' in node ? node.mode : undefined;

      // Rule 1: Validate mode is valid
      if (!this.isValidMode(nodeMode)) {
        errors.push({
          path: key,
          rule: 'invalid-mode',
          message: `Invalid rendering mode: ${nodeMode}. Valid modes: 'slow', 'fast', 'fast+interactive'`,
        });
      }

      // Rule 3: Child mode must be compatible with parent mode
      if (parentMode && !this.isChildModeCompatible(nodeMode, parentMode)) {
        errors.push({
          path: key,
          rule: 'child-mode-incompatible',
          message: `Child mode '${nodeMode}' is incompatible with parent mode '${parentMode}'`,
        });
      }
    }

    // Validate based on node type
    if (node.type === 'array') {
      const arrayMode = 'mode' in node ? node.mode : undefined;

      // Rule 2: Arrays with mode='fast+interactive' are mutable, require all children to be 'fast+interactive'
      if (arrayMode === 'fast+interactive') {
        const childErrors = this.validateMutableArrayChildren(key, node);
        errors.push(...childErrors);
        
        // For mutable arrays, don't pass parent mode to children since we already validated
        // the specific mutable array rule above (avoids duplicate errors)
        for (const [childKey, childNode] of Object.entries(node.itemSchema)) {
          if (childNode) {
            errors.push(...this.validateNode(`${key}[].${childKey}`, childNode, undefined));
          }
        }
      } else {
        // For frozen arrays (slow/fast mode), recurse with parent mode validation
        for (const [childKey, childNode] of Object.entries(node.itemSchema)) {
          if (childNode) {
            errors.push(...this.validateNode(`${key}[].${childKey}`, childNode, arrayMode));
          }
        }
      }
    } else if (node.type === 'object') {
      // Recurse into properties, objects don't enforce a parent mode on children
      for (const [childKey, childNode] of Object.entries(node.properties)) {
        if (childNode) {
          errors.push(...this.validateNode(`${key}.${childKey}`, childNode, undefined));
        }
      }
    }

    return errors;
  }

  private static validateMutableArrayChildren(
    key: string,
    node: ArraySchemaNode
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // All children must be 'fast+interactive' for mutable arrays (mode='fast+interactive')
    for (const [childKey, childNode] of Object.entries(node.itemSchema)) {
      if (childNode) {
        // Skip objects (they don't have mode), but validate their children recursively
        if (childNode.type === 'object') {
          // Objects in mutable arrays need all their properties to be interactive
          for (const [nestedKey, nestedNode] of Object.entries(childNode.properties)) {
            if (nestedNode && 'mode' in nestedNode && nestedNode.mode !== 'fast+interactive') {
              errors.push({
                path: `${key}[].${childKey}.${nestedKey}`,
                rule: 'mutable-array-children-must-be-interactive',
                message: `Array with mode='fast+interactive' (mutable) requires all children to have mode='fast+interactive'. Found: ${nestedNode.mode}`,
              });
            }
          }
        } else if ('mode' in childNode && childNode.mode !== 'fast+interactive') {
          errors.push({
            path: `${key}[].${childKey}`,
            rule: 'mutable-array-children-must-be-interactive',
            message: `Array with mode='fast+interactive' (mutable) requires all children to have mode='fast+interactive'. Found: ${childNode.mode}`,
          });
        }
      }
    }

    return errors;
  }

  private static isValidMode(mode: RenderingMode | undefined): boolean {
    if (!mode) return false;
    const validModes: RenderingMode[] = ['slow', 'fast', 'fast+interactive'];
    return validModes.includes(mode);
  }

  private static isChildModeCompatible(
    childMode: RenderingMode | undefined,
    parentMode: RenderingMode
  ): boolean {
    if (!childMode) return false;

    // Parent 'slow' -> child can be 'slow'
    if (parentMode === 'slow') {
      return childMode === 'slow';
    }
    // Parent 'fast' -> child can be 'fast' or 'fast+interactive'
    if (parentMode === 'fast') {
      return childMode === 'fast' || childMode === 'fast+interactive';
    }
    // Parent 'fast+interactive' -> child can be 'fast' or 'fast+interactive'
    if (parentMode === 'fast+interactive') {
      return childMode === 'fast' || childMode === 'fast+interactive';
    }
    return false;
  }
}

