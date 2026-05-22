/**
 * AUTO-GENERATED -- DO NOT EDIT
 *
 * Generated from specs/ui-policy.json by scripts/generate-ui-policy.mjs.
 * Re-run: npm run policy:generate
 */

/* eslint-disable */

export const UI_POLICY = {
  "$schema": "https://formspec.org/schemas/ui-policy/1.0",
  "version": "1.0",
  "description": "Machine-readable UI authoring policy shared by schema-adjacent tooling, Rust lint, TypeScript runtime helpers, and authoring tools.",
  "components": [
    {
      "name": "Section",
      "primaryHint": "Section",
      "widgets": [
        "Section"
      ],
      "category": "layout"
    },
    {
      "name": "Stack",
      "primaryHint": "Stack",
      "widgets": [
        "Stack"
      ],
      "category": "layout"
    },
    {
      "name": "Grid",
      "primaryHint": "Grid",
      "widgets": [
        "Grid"
      ],
      "category": "layout"
    },
    {
      "name": "TextInput",
      "primaryHint": "TextInput",
      "widgets": [
        "TextInput"
      ],
      "category": "input"
    },
    {
      "name": "NumberInput",
      "primaryHint": "NumberInput",
      "widgets": [
        "NumberInput"
      ],
      "category": "input"
    },
    {
      "name": "DatePicker",
      "primaryHint": "DatePicker",
      "widgets": [
        "DatePicker"
      ],
      "category": "input"
    },
    {
      "name": "Select",
      "primaryHint": "Select",
      "widgets": [
        "Select"
      ],
      "category": "input"
    },
    {
      "name": "CheckboxGroup",
      "primaryHint": "CheckboxGroup",
      "widgets": [
        "CheckboxGroup"
      ],
      "category": "input"
    },
    {
      "name": "Toggle",
      "primaryHint": "Toggle",
      "widgets": [
        "Toggle"
      ],
      "category": "input"
    },
    {
      "name": "FileUpload",
      "primaryHint": "FileUpload",
      "widgets": [
        "FileUpload"
      ],
      "category": "input"
    },
    {
      "name": "Heading",
      "primaryHint": "Heading",
      "widgets": [
        "Heading"
      ],
      "category": "display"
    },
    {
      "name": "Text",
      "primaryHint": "Text",
      "widgets": [
        "Text"
      ],
      "category": "display"
    },
    {
      "name": "Divider",
      "primaryHint": "Divider",
      "widgets": [
        "Divider"
      ],
      "category": "display"
    },
    {
      "name": "Card",
      "primaryHint": "Card",
      "widgets": [
        "Card"
      ],
      "category": "container"
    },
    {
      "name": "Collapsible",
      "primaryHint": "Collapsible",
      "widgets": [
        "Collapsible"
      ],
      "category": "container"
    },
    {
      "name": "ConditionalGroup",
      "primaryHint": "ConditionalGroup",
      "widgets": [
        "ConditionalGroup"
      ],
      "category": "container"
    },
    {
      "name": "Tabs",
      "primaryHint": "Tabs",
      "widgets": [
        "Tabs"
      ],
      "category": "layout"
    },
    {
      "name": "SubmitButton",
      "primaryHint": "SubmitButton",
      "widgets": [
        "SubmitButton"
      ],
      "category": "display"
    },
    {
      "name": "Accordion",
      "primaryHint": "Accordion",
      "widgets": [
        "Accordion"
      ],
      "category": "layout"
    },
    {
      "name": "RadioGroup",
      "primaryHint": "RadioGroup",
      "widgets": [
        "RadioGroup"
      ],
      "category": "input"
    },
    {
      "name": "MoneyInput",
      "primaryHint": "MoneyInput",
      "widgets": [
        "MoneyInput"
      ],
      "category": "input"
    },
    {
      "name": "Slider",
      "primaryHint": "Slider",
      "widgets": [
        "Slider"
      ],
      "category": "input"
    },
    {
      "name": "Rating",
      "primaryHint": "Rating",
      "widgets": [
        "Rating"
      ],
      "category": "input"
    },
    {
      "name": "Signature",
      "primaryHint": "Signature",
      "widgets": [
        "Signature"
      ],
      "category": "input"
    },
    {
      "name": "Alert",
      "primaryHint": "Alert",
      "widgets": [
        "Alert"
      ],
      "category": "display"
    },
    {
      "name": "Badge",
      "primaryHint": "Badge",
      "widgets": [
        "Badge"
      ],
      "category": "display"
    },
    {
      "name": "ProgressBar",
      "primaryHint": "ProgressBar",
      "widgets": [
        "ProgressBar"
      ],
      "category": "display"
    },
    {
      "name": "Summary",
      "primaryHint": "Summary",
      "widgets": [
        "Summary"
      ],
      "category": "display"
    },
    {
      "name": "ValidationSummary",
      "primaryHint": "ValidationSummary",
      "widgets": [
        "ValidationSummary"
      ],
      "category": "display"
    },
    {
      "name": "DataTable",
      "primaryHint": "DataTable",
      "widgets": [
        "DataTable"
      ],
      "category": "display"
    },
    {
      "name": "Panel",
      "primaryHint": "Panel",
      "widgets": [
        "Panel"
      ],
      "category": "container"
    },
    {
      "name": "Modal",
      "primaryHint": "Modal",
      "widgets": [
        "Modal"
      ],
      "category": "container"
    },
    {
      "name": "Popover",
      "primaryHint": "Popover",
      "widgets": [
        "Popover"
      ],
      "category": "container"
    }
  ],
  "retiredComponentNames": [
    "Page",
    "Columns",
    "Spacer"
  ],
  "inputComponents": {
    "TextInput": {
      "strictDataTypes": [
        "string",
        "text",
        "uri"
      ],
      "authoringDataTypes": [
        "integer",
        "decimal",
        "boolean",
        "date",
        "dateTime",
        "time",
        "attachment",
        "choice",
        "multiChoice",
        "money"
      ],
      "requiresOptions": false
    },
    "NumberInput": {
      "strictDataTypes": [
        "integer",
        "decimal"
      ],
      "authoringDataTypes": [
        "money"
      ],
      "requiresOptions": false
    },
    "DatePicker": {
      "strictDataTypes": [
        "date",
        "dateTime",
        "time"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "Select": {
      "strictDataTypes": [
        "choice",
        "multiChoice"
      ],
      "authoringDataTypes": [],
      "requiresOptions": true
    },
    "CheckboxGroup": {
      "strictDataTypes": [
        "multiChoice"
      ],
      "authoringDataTypes": [],
      "requiresOptions": true
    },
    "Toggle": {
      "strictDataTypes": [
        "boolean"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "FileUpload": {
      "strictDataTypes": [
        "attachment"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "RadioGroup": {
      "strictDataTypes": [
        "choice"
      ],
      "authoringDataTypes": [],
      "requiresOptions": true
    },
    "MoneyInput": {
      "strictDataTypes": [
        "integer",
        "decimal",
        "money"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "Slider": {
      "strictDataTypes": [
        "integer",
        "decimal"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "Rating": {
      "strictDataTypes": [
        "integer",
        "decimal"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    },
    "Signature": {
      "strictDataTypes": [
        "attachment"
      ],
      "authoringDataTypes": [],
      "requiresOptions": false
    }
  },
  "compatibilityByDataType": {
    "string": [
      "TextInput"
    ],
    "text": [
      "TextInput"
    ],
    "decimal": [
      "NumberInput",
      "MoneyInput",
      "Slider",
      "Rating"
    ],
    "integer": [
      "NumberInput",
      "MoneyInput",
      "Slider",
      "Rating"
    ],
    "boolean": [
      "Toggle"
    ],
    "date": [
      "DatePicker"
    ],
    "dateTime": [
      "DatePicker"
    ],
    "time": [
      "DatePicker"
    ],
    "uri": [
      "TextInput"
    ],
    "choice": [
      "Select",
      "RadioGroup"
    ],
    "multiChoice": [
      "CheckboxGroup",
      "Select"
    ],
    "attachment": [
      "FileUpload",
      "Signature"
    ],
    "money": [
      "MoneyInput"
    ]
  },
  "fallbackPolicy": {
    "defaultPreserve": [
      "bind",
      "when",
      "responsive",
      "style",
      "cssClass",
      "accessibility"
    ],
    "preserveChildrenWhenFallbackAcceptsChildren": true,
    "unknownComponentSpecificProps": "drop-with-warning",
    "components": {
      "Tabs": {
        "fallback": "Stack",
        "carry": [
          "children"
        ],
        "drop": [
          "placement",
          "defaultTab"
        ],
        "translate": {
          "tabLabels": "insert-heading-before-child"
        }
      },
      "Accordion": {
        "fallback": "Stack",
        "carry": [
          "children"
        ],
        "drop": [
          "allowMultiple",
          "defaultOpen"
        ],
        "translate": {
          "labels": "collapsible-title"
        }
      },
      "RadioGroup": {
        "fallback": "Select",
        "carry": [
          "bind"
        ],
        "drop": [
          "columns",
          "orientation"
        ],
        "translate": {}
      },
      "MoneyInput": {
        "fallback": "NumberInput",
        "carry": [
          "bind",
          "placeholder",
          "step",
          "min",
          "max"
        ],
        "drop": [
          "currency",
          "showCurrency",
          "locale"
        ],
        "translate": {
          "showCurrency": "bound-item-prefix-hint"
        }
      },
      "Slider": {
        "fallback": "NumberInput",
        "carry": [
          "bind",
          "min",
          "max",
          "step"
        ],
        "drop": [
          "showTicks",
          "showValue"
        ],
        "translate": {}
      },
      "Rating": {
        "fallback": "NumberInput",
        "carry": [
          "bind",
          "max"
        ],
        "drop": [
          "icon",
          "allowHalf"
        ],
        "translate": {
          "max": "number-input-max",
          "step": "constant-1",
          "min": "constant-1"
        }
      },
      "Signature": {
        "fallback": "FileUpload",
        "carry": [
          "bind"
        ],
        "drop": [
          "strokeColor",
          "height",
          "penWidth",
          "clearable"
        ],
        "translate": {
          "accept": "image/*"
        }
      },
      "Alert": {
        "fallback": "Text",
        "carry": [
          "text"
        ],
        "drop": [
          "dismissible"
        ],
        "translate": {
          "severity": "prefix-text"
        }
      },
      "Badge": {
        "fallback": "Text",
        "carry": [
          "text"
        ],
        "drop": [
          "variant"
        ],
        "translate": {}
      },
      "ProgressBar": {
        "fallback": "Text",
        "carry": [
          "bind",
          "value",
          "max"
        ],
        "drop": [
          "label",
          "showPercent"
        ],
        "translate": {
          "value": "value-max-percent-text"
        }
      },
      "Summary": {
        "fallback": "Stack",
        "carry": [
          "items"
        ],
        "drop": [],
        "translate": {
          "items": "text-list-label-value"
        }
      },
      "ValidationSummary": {
        "fallback": "Alert",
        "carry": [
          "source",
          "mode",
          "showFieldErrors"
        ],
        "drop": [
          "jumpLinks",
          "dedupe"
        ],
        "translate": {
          "validationRows": "warning-error-alerts"
        }
      },
      "DataTable": {
        "fallback": "Stack",
        "carry": [
          "bind",
          "columns"
        ],
        "drop": [
          "showRowNumbers",
          "allowAdd",
          "allowRemove"
        ],
        "translate": {
          "repeatRows": "card-per-repeat-instance"
        }
      },
      "Panel": {
        "fallback": "Card",
        "carry": [
          "title",
          "children"
        ],
        "drop": [
          "placement",
          "width"
        ],
        "translate": {}
      },
      "Modal": {
        "fallback": "Collapsible",
        "carry": [
          "title",
          "children"
        ],
        "drop": [
          "size",
          "trigger",
          "triggerLabel",
          "closable",
          "headingLevel",
          "placement"
        ],
        "translate": {
          "defaultOpen": "constant-false"
        }
      },
      "Popover": {
        "fallback": "Collapsible",
        "carry": [
          "children"
        ],
        "drop": [
          "triggerBind",
          "placement"
        ],
        "translate": {
          "triggerLabel": "title"
        }
      }
    }
  },
  "responsive": {
    "forbiddenKeys": [
      "component",
      "bind",
      "when",
      "children",
      "responsive"
    ],
    "baseAllowedProps": [
      "style",
      "cssClass",
      "accessibility",
      "layout",
      "hidden",
      "padding",
      "background",
      "border",
      "radius",
      "elevation"
    ],
    "allowedPropsByComponent": {
      "Section": [
        "title",
        "description"
      ],
      "Stack": [
        "direction",
        "gap",
        "align",
        "justify",
        "wrap"
      ],
      "Grid": [
        "columns",
        "gap",
        "rowGap"
      ],
      "Card": [
        "title",
        "padding",
        "background",
        "border",
        "radius",
        "elevation"
      ],
      "Panel": [
        "title",
        "placement",
        "width",
        "padding",
        "background",
        "border",
        "radius",
        "elevation"
      ],
      "Collapsible": [
        "title"
      ],
      "ConditionalGroup": [],
      "Tabs": [
        "placement"
      ],
      "Accordion": [],
      "TextInput": [
        "placeholder",
        "maxLines",
        "inputMode",
        "prefix",
        "suffix",
        "variant"
      ],
      "NumberInput": [
        "placeholder",
        "step",
        "min",
        "max",
        "showStepper"
      ],
      "DatePicker": [
        "placeholder",
        "format",
        "minDate",
        "maxDate",
        "showTime"
      ],
      "Select": [
        "placeholder",
        "searchable",
        "clearable"
      ],
      "CheckboxGroup": [
        "columns",
        "selectAll"
      ],
      "RadioGroup": [
        "columns",
        "orientation"
      ],
      "Toggle": [
        "onLabel",
        "offLabel"
      ],
      "FileUpload": [
        "accept",
        "maxSize",
        "dragDrop"
      ],
      "MoneyInput": [
        "placeholder",
        "step",
        "min",
        "max",
        "showStepper",
        "currency",
        "showCurrency",
        "locale"
      ],
      "Slider": [
        "min",
        "max",
        "step",
        "showValue",
        "showTicks"
      ],
      "Rating": [
        "max",
        "icon",
        "allowHalf"
      ],
      "Signature": [
        "strokeColor",
        "height",
        "penWidth",
        "clearable"
      ],
      "Heading": [
        "text",
        "level"
      ],
      "Text": [
        "text",
        "format"
      ],
      "Divider": [],
      "Alert": [
        "severity",
        "text",
        "dismissible"
      ],
      "Badge": [
        "text",
        "variant"
      ],
      "ProgressBar": [
        "value",
        "max",
        "label",
        "showPercent"
      ],
      "Summary": [
        "items"
      ],
      "ValidationSummary": [
        "showFieldErrors",
        "jumpLinks",
        "dedupe"
      ],
      "DataTable": [
        "columns",
        "showRowNumbers"
      ],
      "Modal": [
        "title",
        "size",
        "triggerLabel",
        "headingLevel",
        "placement"
      ],
      "Popover": [
        "triggerLabel",
        "placement"
      ],
      "SubmitButton": [
        "label",
        "pendingLabel"
      ]
    }
  },
  "breakpoints": {
    "sameNameValuesMustMatch": true
  },
  "pagePrecedence": {
    "order": [
      "componentDirectRootSections",
      "themePages",
      "definitionFallback"
    ],
    "shadowedThemePagesDiagnostic": "W805",
    "conflictingAssignmentDiagnostic": "E805",
    "mergePolicy": "do-not-merge-competing-page-structures"
  },
  "attention": {
    "sources": [
      "requiredIncomplete",
      "validationError",
      "authoringWarning",
      "unsupportedProgressiveFallback"
    ],
    "defaultSeverityOrder": [
      "error",
      "warning",
      "info"
    ],
    "authoringSurface": "lint-diagnostics-first"
  },
  "extensionDiscovery": {
    "rootAnnotationPrefix": "x-",
    "semanticExtensionProperty": "extensions",
    "registryDocumentContext": "registryDocuments",
    "unknownRootAnnotationSemantics": "annotation-only"
  },
  "tokens": {
    "customTokenPrefixes": [
      "x-"
    ],
    "unknownNonExtensionDiagnostic": "W708",
    "platformDefaultDiagnostic": "W709"
  }
} as const;

export type UiPolicy = typeof UI_POLICY;
