import * as vscode from 'vscode';
import * as fs from 'fs';
import { TextDocumentIdentifier, TextDocumentPositionParams } from 'vscode-languageclient';
import { Range, SymbolKind } from "vscode-languageclient";
import path from 'path';
import { findMainClass } from '../util';
import { diagnosticCollection } from '../diagnostics/diagSceneClass';
import { extraImportMap } from '../maps/extraImportMap';
import { typeMap } from '../maps/typeMap';
import { methodTypeParameterMap } from '../maps/methodTypeParameterMap';
import { extraConstructorMap } from '../maps/extraConstructorMap';

enum TypeHierarchyDirection {
    children,
    parents,
    both
}

class LSPTypeHierarchyItem {
    name!: string;
    detail!: string;
    kind!: SymbolKind;
    deprecated!: boolean;
    uri!: string;
    range!: Range;
    selectionRange!: Range;
    parents!: LSPTypeHierarchyItem[];
    children!: LSPTypeHierarchyItem[];
    data: any;
}

interface MethodInfo {
    methodName: string;
    className: string;
    paramList: { "type": string; "param": string; }[];
    returnType?: string;
}

let cancelTokenSource: vscode.CancellationTokenSource | undefined;

export async function generateAllBuilderClasses(document: vscode.TextDocument) {
    const diagnostics = diagnosticCollection.get(document.uri);
    if (!diagnostics || diagnostics.length === 0) {
        vscode.window.showInformationMessage('No builder classes available to generate.');
        return;
    }

    for (const diagnostic of diagnostics) {
        const range = diagnostic.range;
        await generateBuilderClass(document, range, false, 500, 25);
    }

    vscode.window.showInformationMessage(`Generated ${diagnostics.length} builder classes.`);
}

export async function generateBuilderClass(document: vscode.TextDocument, range: vscode.Range, replaceConstructor: boolean = true, diagnosticsInterval = 500, diagnosticsRepeatCount = 25) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    if (editor.document.languageId !== 'java') {
        vscode.window.showErrorMessage('Not a Java file.');
        return;
    }

    let cursorLine = range.start.line;
    if (document === undefined) {
        document = editor.document;
        const cursorPosition = editor.selection.active;
        cursorLine = cursorPosition.line;
    }

    const line = document.lineAt(cursorLine).text;
    const match = line.match(/^(\s*)(.*)new\s+([\w.]+)(?:<([\w\s,]+)>)?\s*\(((?:\([^()]*\)|[^()])*)\)/);
    if (!match) {
        return;
    }
    const startPos = match.index!;
    const matchLength = match[0].length;
    const prevSpaces = match[1];
    const prevText = match[2];
    const targetClassFullName = match[3];
    const matchedTypeParams = match[4] || '';
    const originalArgs = match[5];

    const classNameMatch = targetClassFullName.match(/[\w.]+?\.(\w+?)/);
    const targetClassNameOnly = classNameMatch ? classNameMatch[1] : targetClassFullName;
    const typeParams = matchedTypeParams ? matchedTypeParams.split(',').map(t => t.trim()) : [];

    // Find the position after 'new' keyword
    const newPattern = /new\s+/;
    const newMatch = line.match(newPattern);
    const classStartAt = newMatch ? newMatch.index! + newMatch[0].length : line.indexOf(targetClassNameOnly);

    const classPosition = new vscode.Position(cursorLine, classStartAt + 1);

    const textDocument: TextDocumentIdentifier = TextDocumentIdentifier.create(document.uri.toString());
    const params: TextDocumentPositionParams = {
        textDocument: textDocument,
        position: classPosition,
    };

    let lspItem: LSPTypeHierarchyItem;
    const direction = TypeHierarchyDirection.parents;

    if (cancelTokenSource) {
        //        cancelTokenSource.cancel();
    }
    cancelTokenSource = new vscode.CancellationTokenSource();
    const maxDepth = 100;
    try {
        lspItem = await vscode.commands.executeCommand(
            'java.execute.workspaceCommand',
            'java.navigate.openTypeHierarchy',
            JSON.stringify(params), JSON.stringify(direction), JSON.stringify(maxDepth), cancelTokenSource.token);
    } catch (e) {
        // operation cancelled
        return;
    }

    // const targetClassFullName = lspItem.detail + '.' + lspItem.name;
    // const targetClassName = lspItem.name;

    if (!lspItem) {
        vscode.window.showInformationMessage('Class not found.');
        return;
    }

    const processedClasses = new Set<string>();
    const classQueue: LSPTypeHierarchyItem[] = [lspItem];
    const methodMap = new Map<string, MethodInfo>();
    const constructorMap = new Map<string, MethodInfo>();

    const classesInHierarchy = new Set<string>();

    // Process class hierarchy using queue
    while (classQueue.length > 0) {
        const currentItem = classQueue.shift()!;
        classesInHierarchy.add(currentItem.name);
        const classKey = `${currentItem.uri}#${currentItem.name}`;

        // Skip already processed classes
        if (processedClasses.has(classKey)) {
            continue;
        }
        processedClasses.add(classKey);

        // Get symbol information
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            vscode.Uri.parse(currentItem.uri)
        );

        if (symbols) {
            const classSymbol = symbols.find(symbol =>
                symbol.kind === vscode.SymbolKind.Class &&
                (symbol.name === currentItem.name || symbol.name.startsWith(currentItem.name + "<"))
            );

            if (classSymbol) {
                // Collect setter methods
                classSymbol.children
                    .filter(symbol =>
                        symbol.kind === vscode.SymbolKind.Method &&
                        (symbol.name.startsWith('set') || symbol.name.startsWith('getChildren') || symbol.name.startsWith('getStyleClass')))
                    .forEach(symbol => {
                        const returnType = symbol.detail.replace(/ : /g, '').trim();
                        // Separate method name and parameters
                        const methodMatch = symbol.name.match(/^(\w+)\((.*)\)/);
                        if (methodMatch) {
                            const [, methodName, params] = methodMatch;
                            const dataTypeList = processGenericTypes(params);

                            const key = symbol.name;

                            // Add only methods that haven't been registered yet (ignore parent class methods)
                            if (!methodMap.has(key)) {
                                // Handle inner/deprecated methods
                                const inner_or_deprecated = ['LayoutFlags', 'ParentTraversalEngine', 'DirtyBits'];
                                // Skip if data type contains deprecated types
                                if (dataTypeList.some(type => inner_or_deprecated.some(d => type.includes(d)))) {
                                    return;
                                }

                                const paramList = dataTypeList.map((type, index) => {
                                    var param = 'value';
                                    if (methodName === 'setMaxSize' || methodName === 'setMinSize' || methodName === 'setPrefSize') {
                                        param = index === 0 ? `width` : `height`;
                                    }
                                    else if(dataTypeList.length > 1) {
                                        param = `value${index + 1}`;
                                    }
                                    return { type, param };
                                });

                                methodMap.set(key, {
                                    methodName,
                                    className: currentItem.name,
                                    paramList,
                                    returnType,
                                });
                            }
                        }
                    });

                if (extraConstructorMap[currentItem.name]) {
                    const extraConstructorInfo = extraConstructorMap[currentItem.name].constructors;
                    for (const paramList of Object.values(extraConstructorInfo)) {
                        const key = currentItem.name + "(" + paramList.map(p => p.type).join(",") + ")";
                        constructorMap.set(key, {
                            methodName: currentItem.name,
                            className: currentItem.name,
                            paramList,
                        });
                    }
                }
                else {
                    classSymbol.children.filter(symbol =>
                        symbol.kind === vscode.SymbolKind.Constructor
                        && symbol.name.startsWith(targetClassNameOnly + "(")
                    )
                        .forEach(symbol => {
                            // Separate method name and parameters
                            const constructorMatch = symbol.name.match(/^(\w+?)\((.*)\)/);
                            if (constructorMatch) {
                                const [, methodName, params] = constructorMatch;
                                const dataTypeList = processGenericTypes(params);
                                const key = symbol.name;

                                const paramList = dataTypeList.map((type, index) => {
                                    return { type, param: dataTypeList.length === 1 ? 'value' : `value${index + 1}` };
                                });

                                // Add only methods that haven't been registered yet (ignore parent class methods)
                                if (!constructorMap.has(key)) {
                                    constructorMap.set(key, {
                                        methodName,
                                        className: currentItem.name,
                                        paramList,
                                    });
                                }
                            }
                        });
                }
            }
        }

        // Add parent classes to queue
        if (currentItem.parents && currentItem.parents.length > 0) {
            classQueue.push(...currentItem.parents);
        }
    }

    // Convert Map to array
    const methodInfoList = Array.from(methodMap.values());
    if (methodInfoList.length === 0) {
        vscode.window.showInformationMessage('Cannot generate builder class because no setter methods found.');
        return;
    }

    const constructorInfoList = Array.from(constructorMap.values());

    const mainClass = await findMainClass(document.uri);
    if (mainClass) {
        const edit = new vscode.WorkspaceEdit();

        const builderClassName = `${targetClassNameOnly}Builder`;
        const builderClassFullName = `${mainClass.packageName}.jfxbuilder.${builderClassName}`;
        // Check existing import statements
        const documentText = editor.document.getText();
        const importPattern = new RegExp(`^import\\s+${builderClassFullName};`, 'm');

        if (!importPattern.test(documentText)) {
            // Find package statement
            const packageMatch = documentText.match(/^package\s+[^;]+;/m);

            if (packageMatch) {
                const packageEndPos = editor.document.positionAt(packageMatch.index! + packageMatch[0].length);
                // Add import statement after package statement
                edit.insert(editor.document.uri, new vscode.Position(packageEndPos.line + 1, 0),
                    `\nimport ${builderClassFullName};\n`);
            }
        }

        // Replace 'new TargetClassName' with 'TargetClassNameBuilder.create().build()'
        if (replaceConstructor) {
            const range = new vscode.Range(
                cursorLine,
                startPos,
                cursorLine,
                startPos + matchLength
            );
            var indent = ' '.repeat(prevText.length + 4);
            edit.replace(editor.document.uri, range, `${prevSpaces}${prevText}${builderClassName}.${typeParams.length > 0 ? `<${typeParams.join(', ')}>` : ''}create(${originalArgs})\n${prevSpaces}${indent}.build()`);
            await vscode.workspace.applyEdit(edit);
        }
        await createBuilderClassFile(methodInfoList, constructorInfoList, mainClass, targetClassNameOnly, classesInHierarchy, diagnosticsRepeatCount, diagnosticsInterval);
    } else {
        console.log('Main class not found.');
    }
}

function processGenericTypes(text: string): string[] {
    const result: string[] = [];
    let depth = 0;
    let current = '';
    let inGeneric = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '<') {
            depth++;
            inGeneric = true;
            current += char;
        }
        else if (char === '>') {
            depth--;
            current += char;
            if (depth === 0) {
                inGeneric = false;
            }
        }
        else if (char === ',' && !inGeneric) {
            if (current.trim()) {
                result.push(current.trim());
            }
            current = '';
        }
        else {
            current += char;
        }
    }
    if (current.trim()) {
        result.push(current.trim());
    }
    return result;
}

async function createBuilderClassFile(methodInfoList: MethodInfo[], constructorInfoList: MethodInfo[], mainClass: { packageName: string, filePath: string }, targetClassName: string, classesInHierarchy: Set<string>, diagnosticsRepeatCount: number, diagnosticsInterval: number) {
    const mainClassPath = mainClass.filePath;
    const mainClassDir = mainClassPath.substring(0, mainClassPath.lastIndexOf(path.sep));

    // Create jfxbuilder folder path
    const builderDirPath = `${mainClassDir}/jfxbuilder`;

    try {
        const extraConstructorInfo = extraConstructorMap[targetClassName]?.constructors;
        let extraBuilderMethod = "";
        const fieldMap: { [key: string]: boolean } = {};
        const methodMap: { [key: string]: boolean } = {};

        const initialValue: { [key: string]: string } = {
            //            boolean: "false",
            byte: "-1",
            short: "-1",
            int: "-1",
            long: "-1L",
            float: "-1.0f",
            double: "-1.0d",
            char: "\\u0000"
        };

        if (extraConstructorInfo) {
            for (const infoArray of Object.values(extraConstructorInfo)) {
                for (const info of infoArray) {
                    if (!fieldMap[info.type + info.param]) {
                        fieldMap[info.type + info.param] = true;
                        const methodName = 'set' + info.param.charAt(0).toUpperCase() + info.param.slice(1);
                        methodMap[info.param + info.type] = true;
                        if (initialValue[info.type]) {
                            extraBuilderMethod += `    private ${info.type} ${info.param} = ${initialValue[info.type]};\n`;
                        }
                        else {
                            extraBuilderMethod += `    private ${info.type} ${info.param};\n`;
                        }
                        extraBuilderMethod += `    public ${targetClassName}Builder ${info.param}(${info.type} ${info.param}) { 
                            if(in == null) { this.${info.param} = ${info.param}; }
                            else { in.${methodName}(${info.param}); }
                            return this; }\n`;
                    }
                }
            }

            const createMethod = `    public static ${targetClassName}Builder create() { return new ${targetClassName}Builder(); }`;
            const builderConstructor = `    private ${targetClassName}Builder() {}`;
            extraBuilderMethod += createMethod + '\n' + builderConstructor;
        }


        let constructorTypeParams: string[] = [];
        let constructorTypeParameter = "";

        // Collect type parameters from constructor

        const typeCandidate = ["R", "S", "T", "V", "W", "X", "Y", "Z"];
        const typeRegex = /<([^<>]+)>/;
        constructorInfoList.forEach(info =>
            info.paramList.forEach((param, index) => {
                const typeParamMatch = param.type.match(typeRegex);
                if (typeParamMatch) {
                    typeParamMatch[1].split(',').map(t => t.trim()).forEach(t => {
                        if (!constructorTypeParams.includes(t) && typeCandidate.includes(t)) {
                            constructorTypeParams.push(t);
                        }
                    });
                }
            })
        );
        // Collect type parameters from method
        methodInfoList.forEach(info =>
            info.paramList.forEach((param, index) => {
                if (info.methodName === "setEventHandler") {
                    // ignore setEventHandler(EventType<T> ..)
                    return;
                }
                if (typeMap[targetClassName] && typeMap[targetClassName][param.type]) {
                    param.type = typeMap[targetClassName][param.type];
                }
                if (typeCandidate.includes(param.type)) {
                    if (!constructorTypeParams.includes(param.type)) {
                        constructorTypeParams.push(param.type);
                        return;
                    }
                }
                const typeParamMatch = param.type.match(typeRegex);
                if (typeParamMatch) {
                    typeParamMatch[1].split(',').map(t => t.trim()).forEach(t => {
                        if (!constructorTypeParams.includes(t) && typeCandidate.includes(t)) {
                            constructorTypeParams.push(t);
                        }
                    });
                }
            })
        );
        constructorTypeParameter = constructorTypeParams.length > 0 ? `<${constructorTypeParams.sort().join(', ')}>` : '';

        const builderCreateMethods = constructorInfoList
            .map(info => {
                const paramValuesStr = info.paramList.map((param, index) => {
                    return param.param;
                }).join(', ');

                const paramPairs = info.paramList.map((param, index) => {
                    return `${param.type} ${param.param}`;
                });

                const paramList = paramPairs.join(', ');

                const methodSignature = `    public static ${constructorTypeParameter} ${targetClassName}Builder${constructorTypeParameter} create(${paramList})`;
                const createMethod = methodSignature + ` { return new ${targetClassName}Builder${constructorTypeParameter}(${paramValuesStr}); }`;
                const builderConstructor = `    private ${targetClassName}Builder(${paramList}) { in = new ${targetClassName}${constructorTypeParameter}(${paramValuesStr}); }`;
                return createMethod + `\n\n${builderConstructor}`;
            })
            .join('\n\n');


        // Generate methods in Builder class
        const builderMethods = methodInfoList
            .map(info => {
                const paramPairs = info.paramList.map((param, index) => {
                    return `${param.type} ${param.param}`;
                });

                const methodName = info.methodName.substring(3); // Remove 'set'
                const firstChar = methodName.charAt(0).toLowerCase();
                const builderMethodName = firstChar + methodName.slice(1);

                const paramValues = info.paramList.map((param, index) => {
                    return param.param;
                }).join(', ');

                const paramList = paramPairs.join(', ');

                // Skip duplicate methods
                const firstParamType = paramList.split(' ')[0];
                if (methodMap[builderMethodName + firstParamType]) {
                    return;
                }

                const createInstanceIfNotExists = extraConstructorInfo ? "if (in == null) build(); " : "";

                if (builderMethodName === 'children') {
                    if (info.returnType) {
                        const genericTypeMatch = info.returnType.match(/^ObservableList<(.+)>$/);
                        if (genericTypeMatch) {
                            const genericType = genericTypeMatch[1];
                            return `    public ${targetClassName}Builder${constructorTypeParameter} children(${genericType}... elements) { ${createInstanceIfNotExists}in.getChildren().setAll(elements); return this; }`;
                        }
                    }
                }
                else if (builderMethodName === 'styleClass') {
                    return `    public ${targetClassName}Builder${constructorTypeParameter} styleClass(String styleClassName) { ${createInstanceIfNotExists}in.getStyleClass().add(styleClassName); return this; }`;
                }
                else {
                    let methodTypeParam = methodTypeParameterMap[targetClassName] ? (methodTypeParameterMap[targetClassName][info.methodName] || '') : '';
                    if (!methodTypeParam) {
                        if (info.methodName === "setEventHandler") {
                            methodTypeParam = "<T extends Event>";
                        }
                    }
                    if (!methodTypeParam && methodTypeParam !== '') {
                        methodTypeParam += ' ';
                    }
                    return `    public ${methodTypeParam}${targetClassName}Builder${constructorTypeParameter} ${builderMethodName}(${paramList}) { ${createInstanceIfNotExists}in.${info.methodName}(${paramValues}); return this; }`;
                }
            })
            .join('\n\n');

        let extraImport = "";
        extraImport += `import javafx.scene.media.*;\n`;
        extraImport += `import javafx.scene.web.*;\n`;

        if (extraImportMap[targetClassName]) {
            extraImport += extraImportMap[targetClassName].map(cls => "import " + cls + ";").join('\n');
        }

        // NOTICE: module check is not needed because unused import is always removed
        // const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(mainClass.filePath));
        // const moduleNames = moduleMaps[workspaceFolder.uri.fsPath];
        // if (moduleNames) {
        //     if (moduleNames.includes('javafx.media')) {
        //         extraImport += `import javafx.scene.media.*;`;
        //     }
        //     if (moduleNames.includes('javafx.web')) {
        //         extraImport += `import javafx.scene.web.*;`;
        //     }
        // }
        // }
        // }
        // }

        let buildMethod = `    public ${targetClassName}${constructorTypeParameter} build() { return in; }`;
        // Replace constructor with extra constructor
        if (extraConstructorInfo) {
            let constructorCode = "";
            let firstConstructor = true;
            for (const infoArray of Object.values(extraConstructorInfo)) {
                let constructorCondition = "";
                let constructorParams = "";
                for (let i = 0; i < infoArray.length; i++) {
                    const info = infoArray[i];
                    if (info.type !== 'boolean') {
                        if (i > 0) {
                            constructorCondition += " && ";
                        }

                        if (initialValue[info.type]) {
                            constructorCondition += `${info.param} != ${initialValue[info.type]}`;
                        }
                        else {
                            constructorCondition += `${info.param} != null`;
                        }
                    }
                    constructorParams += `${info.param}`;
                    if (i < infoArray.length - 1) {
                        constructorParams += ", ";
                    }
                }
                if (firstConstructor) {
                    constructorCode += `if(${constructorCondition}) {
                        in = new ${targetClassName}(${constructorParams});
                    }`;
                    firstConstructor = false;
                }
                else {
                    constructorCode += `else if(${constructorCondition}) {
                        in = new ${targetClassName}(${constructorParams});
                    }`;
                }
            }
            buildMethod = `    public ${targetClassName} build() { 
                if(in == null) {
                    ${constructorCode}
                }
                return in;
            }`;
        }



        // Generate Builder class code
        let builderCode = `package ${mainClass.packageName}.jfxbuilder;

import javafx.scene.*;
import javafx.scene.canvas.*;
import javafx.scene.chart.*;
import javafx.scene.control.*;
import javafx.scene.control.cell.*;
import javafx.scene.control.skin.*;
import javafx.scene.effect.*;
import javafx.scene.image.*;
import javafx.scene.input.*;
import javafx.scene.layout.*;
import javafx.scene.paint.*;
import javafx.scene.shape.*;
import javafx.scene.text.*;
import javafx.scene.transform.*;

${extraImport}

import javafx.css.*;
import javafx.event.*;
import javafx.geometry.*;
import javafx.collections.*;
import javafx.util.*;
import javafx.stage.*;
import javafx.beans.value.ObservableValue;

import java.util.*;
import java.io.*;
import java.time.*;
import java.time.chrono.*;


public class ${targetClassName}Builder${constructorTypeParameter} {
    private ${targetClassName}${constructorTypeParameter} in;
${extraBuilderMethod}
${builderCreateMethods}
${buildMethod}

    public ${targetClassName}Builder${constructorTypeParameter} apply(java.util.function.Consumer<${targetClassName}${constructorTypeParameter}> func) {
        ${extraConstructorInfo ? "if (in == null) build();\n" : ""}func.accept((${targetClassName}${constructorTypeParameter}) in);
        return this;
    }

${builderMethods}
}
`;

        // Create folder if it doesn't exist
        if (!fs.existsSync(builderDirPath)) {
            fs.mkdirSync(builderDirPath);
        }
        const builderFilePath = `${builderDirPath}/${targetClassName}Builder.java`;

        // Create file
        fs.writeFileSync(builderFilePath, builderCode);
        console.log(`Builder class created: ${builderFilePath}`);

        // Run diagnostics every 0.5 seconds

        for (let i = 0; i < diagnosticsRepeatCount; i++) {
            await new Promise(resolve => setTimeout(resolve, diagnosticsInterval));
            const diagnostics = vscode.languages.getDiagnostics(vscode.Uri.file(builderFilePath));
            if (diagnostics.length > 0) {
                // Comment out lines with diagnostics
                const lines = builderCode.split('\n');
                diagnostics.forEach(diagnostic => {
                    const lineNumber = diagnostic.range.start.line;
                    // extraBuilderMethod may have undefined method
                    if (diagnostic.code === '67108964') { // method not found
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '67108965') { // method not visible
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '134217859') { // constructor not visible
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '134217858') { // constructor not defined
                        // Constructor not defined when remove invisible constructor
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '268435844') { // never used
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '603979893') { // static method
                        lines[lineNumber] = '';
                    }
                    if (diagnostic.code === '268435846') { // import cannot be resolved
                        lines[lineNumber] = '';
                    }
                });

                builderCode = lines
                    .filter(line => !line.trim().startsWith('//'))
                    .join('\n');

                fs.writeFileSync(builderFilePath, builderCode);
            }
        }
        builderCode = builderCode.replace(/\n+/g, '\n');
        fs.writeFileSync(builderFilePath, builderCode);
    } catch (error) {
        console.error('Failed to create Builder class:', error);
    }
}