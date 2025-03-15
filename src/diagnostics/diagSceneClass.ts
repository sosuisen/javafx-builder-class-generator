import * as vscode from 'vscode';
import { findMainClass } from '../util';
import * as path from 'path';
import * as fs from 'fs';

interface ClassInfo {
    fullName: string;
    simpleClassName: string;
    typeParameters: string[];
}

interface DiagnosticWithTypeParams extends vscode.Diagnostic {
    typeParameters?: string[];
}

function parseClassInfo(line: string): ClassInfo | null {
    // Capture class name and optional type parameters
    const constructorPattern = /new\s+([\w.]+)(?:<([\w\s,]+)>)?\s*\(/;
    const match = line.match(constructorPattern);

    if (!match) {
        return null;
    }

    const fullName = match[1];
    const typeParamsStr = match[2] || '';
    const typeParameters = typeParamsStr ? typeParamsStr.split(',').map(t => t.trim()) : [];

    // Extract simple class name
    const classNamePattern = /new\s+[\w.]+?\.(\w+?)(?:<[\w\s,]+>)?\s*\(/;
    const classMatch = line.match(classNamePattern);
    const simpleClassName = classMatch ? classMatch[1] : fullName;

    return {
        fullName,
        simpleClassName,
        typeParameters
    };
}

export const diagnosticCollection = vscode.languages.createDiagnosticCollection('scene-class-diagnostic');

export async function diagSceneClass(document: vscode.TextDocument) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
        return;
    }
    diagnosticCollection.delete(document.uri);
    const diagnostics: vscode.Diagnostic[] = [];

    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        const classInfo = parseClassInfo(line);

        if (classInfo) {
            // Find the position after 'new' keyword
            const newPattern = /new\s+/;
            const newMatch = line.match(newPattern);
            const classStartAt = newMatch ? newMatch.index! + newMatch[0].length : line.indexOf(classInfo.simpleClassName);
            const classPosition = new vscode.Position(i, classStartAt + 1);

            try {
                const typeDefinitions = await vscode.commands.executeCommand<vscode.Location[]>(
                    'vscode.executeTypeDefinitionProvider',
                    document.uri,
                    classPosition
                );

                if (!typeDefinitions || typeDefinitions.length === 0 ||
                    !typeDefinitions[0].uri.path.includes('javafx.scene')
                ) {
                    continue;
                }

                const mainClass = await findMainClass(document.uri);
                if (!mainClass) {
                    continue;
                }
                const mainClassPath = mainClass.filePath;
                const mainClassDir = mainClassPath.substring(0, mainClassPath.lastIndexOf(path.sep));
                const builderDirPath = `${mainClassDir}/jfxbuilder`;
                const builderFilePath = `${builderDirPath}/${classInfo.simpleClassName}Builder.java`;
                if (fs.existsSync(builderFilePath)) {
                    continue;
                }

                const range = new vscode.Range(
                    i,
                    classStartAt,
                    i,
                    classStartAt + classInfo.simpleClassName.length
                );

                const message = classInfo.typeParameters.length > 0
                    ? `Can generate builder class (Type parameters: ${classInfo.typeParameters.join(', ')})`
                    : 'Can generate builder class';
                const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Hint) as DiagnosticWithTypeParams;
                diagnostic.typeParameters = classInfo.typeParameters;
                diagnostics.push(diagnostic);

            } catch (e) {
                console.error(e);
            }
        }
        diagnosticCollection.set(document.uri, diagnostics);
    }
}
