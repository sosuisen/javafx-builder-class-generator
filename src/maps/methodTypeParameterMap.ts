// Specifies method-specific type parameters
export const methodTypeParameterMap: Record<string, Record<string, string>> = {
    "CheckBoxListCell": {
        "setEventHandler": "<T extends Event>",
    },
    "ChoiceBoxTableCell": {
        "setEventHandler": "<T extends Event>",
    },
    "ChoiceBoxTreeTableCell": {
        "setEventHandler": "<T extends Event>",
    },
    "ComboBoxTableCell": {
        "setEventHandler": "<T extends Event>",
    },
    "ComboBoxTreeTableCell": {
        "setEventHandler": "<T extends Event>",
    },
    "Tab": {
        "setEventHandler": "<E extends Event>",
    },
    "TextFieldTableCell": {
        "setEventHandler": "<T extends Event>",
    },
    "TextFieldTreeTableCell": {
        "setEventHandler": "<T extends Event>",
    },
};

