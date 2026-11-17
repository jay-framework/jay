// Public, side-effect-free subpath for the design-token primitives (DL#233). Consumed by
// @jay-framework/editing-policy to classify a change as design-system-token-only. Kept separate from
// `./tools` so importers never pull the validators / settings-page component.
export {
    matchColor,
    matchSpacing,
    matchRounded,
    matchTypographyProperty,
    matchAnimationDuration,
    matchAnimationEasing,
    matchComponent,
    isColorProperty,
    isSpacingProperty,
    isRadiusProperty,
    isTypographyProperty,
    isAnimationDurationProperty,
    isAnimationEasingProperty,
    type MatchResult,
} from './token-matcher.js';
export {
    parseDesignMd,
    findDesignMd,
    type DesignTokens,
    type FoundDesignMd,
    type TypographyToken,
    type ComponentSpec,
    type AnimationPreset,
    type DesignRules,
} from './parse-design-md.js';
