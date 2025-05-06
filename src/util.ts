import * as vscode from 'vscode';

export async function findMainClass(uri: vscode.Uri): Promise<{ packageName: string, filePath: string } | null> {
    const currentFileUri = vscode.Uri.parse(uri.toString());
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(currentFileUri);
    if (!workspaceFolder) {
        return null;
    }
    const pattern = new vscode.RelativePattern(workspaceFolder, 'src/**/*.java');
    const files = await vscode.workspace.findFiles(pattern);

    for (const file of files) {
        try {
            const document = await vscode.workspace.openTextDocument(file);
            const content = document.getText();

            const packageMatch = content.match(/package\s+([^;]+);/);
            if (packageMatch) {
                const packageName = packageMatch[1].trim();
                const applicationPattern = /class\s+\w+\s+extends\s+(?:javafx\.application\.)?(Application)/;
                if (applicationPattern.test(content)) {
                    return { packageName, filePath: file.fsPath };
                }
            }
        }
        catch (e) {
            console.error(`Error processing file ${file.fsPath}:`, e);
            continue;
        }
    }

    return null;
}

export const moduleMaps: { [key: string]: string[] } = {};
export function checkModule(document: vscode.TextDocument) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return;
    }

    const content = document.getText();
    content.split('\n').forEach(line => {
        const modulePattern = /requires\s+([\w.]+);/;
        const moduleMatch = line.match(modulePattern);
        if (moduleMatch) {
            const moduleName = moduleMatch[1].trim();
            if (!moduleMaps[workspaceFolder.uri.fsPath]) {
                moduleMaps[workspaceFolder.uri.fsPath] = [];
            }
            moduleMaps[workspaceFolder.uri.fsPath].push(moduleName);
        }
    });
}

export function deleteModule(document: vscode.TextDocument) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        return;
    }

    delete moduleMaps[workspaceFolder.uri.fsPath];
}

