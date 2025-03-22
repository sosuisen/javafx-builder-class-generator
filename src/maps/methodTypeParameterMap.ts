// Specifies method-specific type parameters
// default is  "setEventHandler": "<T extends Event>",
export const methodTypeParameterMap: Record<string, Record<string, string>> = {
    "Tab": {
        "setEventHandler": "<E extends Event>",
    },
    "TextFieldTreeTableCell": {
        "setEventHandler": "<R extends Event>",
    },
};

