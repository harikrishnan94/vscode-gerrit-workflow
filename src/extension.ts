// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Axios, AxiosError } from 'axios';
import * as vscode from 'vscode';
import { updateUserInformation } from './userInformation';

const axios: Axios = require('axios')

async function getGerritServerURL(): Promise<string> {
	let serverURL = vscode.workspace.getConfiguration("gerrit-workflow").get<string | undefined>("gerritServerURL");
	const isValidURL = (str: string) => {
		try {
			const url = new URL(str);
			return url.protocol === "http:" || url.protocol === "https:";
		} catch (_) {
			return false;
		}
	};

	serverURL = await vscode.window.showInputBox({
		prompt: "Enter Gerrit Server URL",
		ignoreFocusOut: true,
		value: serverURL,
		validateInput: (input) => {
			if (isValidURL(input))
				return undefined;
			return { message: "Invalid URL", severity: vscode.InputBoxValidationSeverity.Error };
		}
	});

	if (!serverURL)
		throw new Error("Gerrit Server not provided");

	return serverURL
}

async function getGerritUserName(): Promise<string> {
	const username = await vscode.window.showInputBox({
		prompt: "Enter Gerrit Account Username",
		ignoreFocusOut: true,
		validateInput: (input) => {
			if (input.toLocaleLowerCase().match('^[a-z0-9]+$'))
				return undefined;
			return { message: "Invalid Username", severity: vscode.InputBoxValidationSeverity.Error };
		}
	});

	if (!username)
		throw new Error("Gerrit Account Username not provided");

	return username
}

async function getGerritPassword(): Promise<string> {
	const password = await vscode.window.showInputBox({
		prompt: "Enter Gerrit Account Password",
		password: true,
		ignoreFocusOut: true,
		validateInput: (input) => {
			if (!input.includes(':'))
				return undefined;
			return { message: "Password must not contain ':'", severity: vscode.InputBoxValidationSeverity.Error };
		}
	});

	if (!password)
		throw new Error("Gerrit Account Password not provided");

	return password
}

function registerAddCredentialCommand(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('gerrit-workflow.addCrendential', async () => {
		try {
			const serverUrl = await getGerritServerURL();
			const username = await getGerritUserName();
			const password = await getGerritPassword();
			let authToken = Buffer.from(`${username}:${password}`).toString('base64');

			let reqOptions = {
				url: serverUrl + "/a/accounts/self",
				method: "GET",
				headers: {
					"Accept": "*/*",
					"User-Agent": "VSCode Gerrit WorkFlow",
					"Authorization": `Basic ${authToken}`
				},
			}

			const response = await axios.request<string>(reqOptions)
			await updateUserInformation(context, serverUrl, JSON.parse(response.data.split('\n')[1]), password);
			vscode.window.showInformationMessage("Saved!")
		} catch (error) {
			const reportError = (msg: string) => {
				vscode.window.showErrorMessage(`Credentials verification failed: ${msg}`);
			};
			if (error instanceof AxiosError) { reportError(`${error.message}(${error.response?.statusText!})`); }
			else if (error instanceof Error) { reportError(error.message); }
			else { reportError(JSON.stringify(error)); }
		}
	});

	context.subscriptions.push(disposable);
}


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gerrit-workflow" is now active!');
	registerAddCredentialCommand(context);
}

// this method is called when your extension is deactivated
export function deactivate() { }
