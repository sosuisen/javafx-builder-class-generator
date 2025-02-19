import * as vscode from 'vscode';

import path from 'path';
import * as fs from 'fs';
import { findMainClass } from '../util';

export class BuilderClassCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        // Update CodeLens when cursor position changes
        vscode.window.onDidChangeTextEditorSelection(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {

        const codeLenses: vscode.CodeLens[] = [];
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document !== document) {
            return codeLenses;
        }

        const cursorPosition = editor.selection.active;
        const cursorLine = cursorPosition.line;
        const line = editor.document.lineAt(cursorLine).text;

        const constructorPattern = /new\s+([\w.]+)\s*\(/;
        const match = line.match(constructorPattern);

        if (match) {
            // MyClass or my.package.MyClass
            const targetClassFullName = match[1];
            const classNamePattern = /new\s+[\w.]+?\.(\w+?)\s*\(/;
            const classMatch = line.match(classNamePattern);
            // MyClass
            const targetClassNameOnly = classMatch ? classMatch[1] : targetClassFullName;
            const classStartAt = line.indexOf(targetClassNameOnly + "(");
            const classPosition = new vscode.Position(cursorPosition.line, classStartAt + 1);

            // Get type definitions
            try {
                const typeDefinitions = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeTypeDefinitionProvider',
                    document.uri,
                    classPosition
                );

                // Show CodeLens only if new of javafx.scene.* Class is found
                if (!typeDefinitions || typeDefinitions.length === 0 ||
                    !typeDefinitions[0].uri.path.includes('javafx.scene')
                ) {
                    return codeLenses;
                }

                const mainClass = await findMainClass(document.uri);
                if (!mainClass) {
                    return codeLenses;
                }
                const mainClassPath = mainClass.filePath;
                const mainClassDir = mainClassPath.substring(0, mainClassPath.lastIndexOf(path.sep));
                const builderDirPath = `${mainClassDir}/jfxbuilder`;
                const builderFilePath = `${builderDirPath}/${targetClassNameOnly}Builder.java`;
                if (fs.existsSync(builderFilePath)) {
                    return codeLenses;
                }

                const range = new vscode.Range(
                    cursorLine,
                    classStartAt,
                    cursorLine,
                    classStartAt + targetClassNameOnly.length
                );

                codeLenses.push(new vscode.CodeLens(range, {
                    title: 'Generate Builder Class',
                    command: 'javafx-builder-class-generator.generateBuilderClass'
                }));
            } catch (e) {
                console.error(e);
            }
        }
        return codeLenses;
    }
}