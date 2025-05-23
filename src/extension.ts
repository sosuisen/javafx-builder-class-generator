import * as vscode from 'vscode';
import { generateBuilderClass, generateAllBuilderClasses } from './command/generateBuilderClass';
import { deleteModule } from './util';
import { BuilderClassCodeActionProvider } from './codeactions/builderClass';
import { diagSceneClass } from './diagnostics/diagSceneClass';

async function delay(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// This method is called when the extension is activated
export async function activate(context: vscode.ExtensionContext) {
	await delay(10000); // wait activation of Language Support for Java
	console.log('JavaFX Builder Class Generator extension is activated');

	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		console.error('No workspace folder is open.');
		return;
	}

	async function checkAllJavaFiles() {
		const files = await vscode.workspace.findFiles("**/*.java");
		files.forEach(async uri => {
			const document = await vscode.workspace.openTextDocument(vscode.Uri.file(uri.fsPath));
			if (uri.path.endsWith('module-info.java')) {
				//			checkModule(document);
			}
			else {
				diagSceneClass(document);
			}
		});
	}


	/**
	 * Observe changes of *.java files.
	 */
	checkAllJavaFiles();
	const javaWatcher = vscode.workspace.createFileSystemWatcher('**/*.java');
	// Change of *.java file is detected when the file is saved.
	javaWatcher.onDidChange(async uri => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(uri.fsPath));
		if (uri.path.endsWith('module-info.java')) {
			//			checkModule(document);
		}
		else {
			diagSceneClass(document);
		}
	});
	javaWatcher.onDidCreate(async uri => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(uri.fsPath));
		if (uri.path.endsWith('module-info.java')) {
			//			checkModule(document);
		}
		else {
			diagSceneClass(document);
		}
	});
	javaWatcher.onDidDelete(async uri => {
		const document = await vscode.workspace.openTextDocument(vscode.Uri.file(uri.fsPath));
		if (uri.path.endsWith('module-info.java')) {
			deleteModule(document);
		}
		else {
			diagSceneClass(document);
		}
	});

	// A change to the .java file is detected if it is not saved.	
	vscode.workspace.onDidChangeTextDocument(event => {
		const document = event.document;
		if (document.fileName === 'module-info.java') {
			//			checkModule(document);
		}
		else if (document.languageId === 'java') {
			diagSceneClass(document);
		}
	});


	context.subscriptions.push(
		vscode.languages.registerCodeActionsProvider('java', new BuilderClassCodeActionProvider(),
			{ providedCodeActionKinds: BuilderClassCodeActionProvider.providedCodeActionKinds })
	);

	/*
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider('java', new BuilderClassCodeLensProvider())
	);
	*/

	context.subscriptions.push(
		vscode.commands.registerCommand('javafx-builder-class-generator.generateBuilderClass', (document: vscode.TextDocument, range: vscode.Range) =>
			generateBuilderClass(document, range)
		)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('javafx-builder-class-generator.generateAllBuilderClasses', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				generateAllBuilderClasses(editor.document);
			}
		})
	);

}

// This method is called when your extension is deactivated
export function deactivate() { }