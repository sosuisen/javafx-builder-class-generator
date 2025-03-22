export const typeMap: Record<string, Record<string, string>> = {
    "Alert": {
        "R": "ButtonType",
        "Callback<ButtonType,R>": "Callback<ButtonType,ButtonType>",
    },
    "ChoiceDialog": {
        "R": "T",
        "Callback<ButtonType,R>": "Callback<ButtonType,T>",
    },
    "ColorPicker": {
        "T": "Color"
    },
    "DateCell": {
        "T": "LocalDate"
    },
    "DatePicker": {
        "T": "LocalDate"
    },
    "ProgressBarTableCell": {
        "T": "Double",
        "TableColumn<S,T>": "TableColumn<S,Double>",
    },
    "ProgressBarTreeTableCell": {
        "T": "Double",
        "TreeTableColumn<S,T>": "TreeTableColumn<S,Double>",
    },
    "TextInputDialog": {
        "R": "String",
        "Callback<ButtonType,R>": "Callback<ButtonType,String>",
    },
    "TextFieldTreeTableCell": {
        "EventType<T>": "EventType<R>",
        "EventHandler<? super T>": "EventHandler<? super R>",
    },
    "TreeTableColumn": {
        "TableColumnBase<S,?>": "TableColumnBase<TreeItem<S>,?>"
    },
    "SplitPaneSkin": {
        "ContentDivider": "SplitPaneSkin.ContentDivider",
    },

};
