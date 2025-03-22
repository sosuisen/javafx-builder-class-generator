export const typeMap: Record<string, Record<string, string>> = {
    "Alert": {
        "R": "ButtonType",
        "Callback<ButtonType,R>": "Callback<ButtonType,ButtonType>",
    },
    "TextInputDialog": {
        "R": "String",
        "Callback<ButtonType,R>": "Callback<ButtonType,String>",
    }
};
