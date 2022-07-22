// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import {
    addCredential,
    clearCredentials,
    getAllCredentials,
    SelfResponse as SelfResponse,
} from "./credentialStore";
import { reportError } from "./errorHandling";
import { ProjectsDataProvider } from "./projectsView";
import {
    bareRequest,
    loadWorkspaceDefaultConnection,
    setWorspaceDefaultConnection,
} from "./request";

async function getGerritServerURL(): Promise<string> {
    let serverURL = vscode.workspace
        .getConfiguration("gerrit-workflow")
        .get<string | undefined>("gerritServerURL");
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
            if (isValidURL(input)) return undefined;
            return {
                message: "Invalid URL",
                severity: vscode.InputBoxValidationSeverity.Error,
            };
        },
    });

    if (!serverURL) throw new Error("Gerrit Server not provided");

    return serverURL;
}

async function getGerritUserName(): Promise<string> {
    const username = await vscode.window.showInputBox({
        prompt: "Enter Gerrit Account Username",
        ignoreFocusOut: true,
        validateInput: (input) => {
            if (input.toLocaleLowerCase().match("^[a-z0-9]+$"))
                return undefined;
            return {
                message: "Invalid Username",
                severity: vscode.InputBoxValidationSeverity.Error,
            };
        },
    });

    if (!username) throw new Error("Gerrit Account Username not provided");

    return username;
}

async function getGerritPassword(): Promise<string> {
    const password = await vscode.window.showInputBox({
        prompt: "Enter Gerrit Account Password",
        password: true,
        ignoreFocusOut: true,
        validateInput: (input) => {
            if (!input.includes(":")) return undefined;
            return {
                message: "Password must not contain ':'",
                severity: vscode.InputBoxValidationSeverity.Error,
            };
        },
    });

    if (!password) throw new Error("Gerrit Account Password not provided");

    return password;
}

function registerAddCredentialCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.addCrendential",
        async () => {
            try {
                const serverUrl = await getGerritServerURL();
                const username = await getGerritUserName();
                const password = await getGerritPassword();
                const selfResonse = await bareRequest<SelfResponse>(
                    "GET",
                    "accounts/self",
                    serverUrl,
                    username,
                    password
                );
                await addCredential(context, serverUrl, selfResonse, password);
                vscode.window.showInformationMessage("Credential Saved!");
            } catch (error) {
                reportError("Credentials verification failed", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

async function selectCredential(context: vscode.ExtensionContext) {
    const credentials = await getAllCredentials(context);
    const quickPickItems = credentials.map((cred) => {
        return {
            label: `Username: ${cred.username}`,
            detail: `Server URL: ${cred.serverURL}`,
            credential: cred,
        };
    });
    const userPick = await vscode.window.showQuickPick(quickPickItems, {
        title: "Select Gerrit Account Information to use",
    });
    if (userPick) {
        let success = await setWorspaceDefaultConnection(
            userPick.credential,
            context
        );
        if (!success) {
            vscode.window.showErrorMessage(
                `Cannot find password for: ${userPick.label}`
            );
        }
        await ProjectsDataProvider.instance().refresh();
    }
}

function registerSelectCredentialCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.selectCredential",
        async () => {
            try {
                const credentials = await getAllCredentials(context);

                if (credentials.length == 0) {
                    let userAction = await vscode.window.showInformationMessage(
                        "No Credentials were found. Do you want to enter credentials?",
                        "Yes",
                        "No"
                    );

                    if (userAction !== "Yes") return;

                    await vscode.commands.executeCommand(
                        "gerrit-workflow.addCrendential"
                    );
                }

                await selectCredential(context);
            } catch (error) {
                reportError("Credentials selection failed", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerClearCredentialsCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.clearCredentials",
        async () => {
            try {
                let userAction = await vscode.window.showWarningMessage(
                    "Are you sure, that you want to clear all credentials? You can add credentials later.",
                    "Yes",
                    "No"
                );

                if (userAction !== "Yes") return;

                await clearCredentials(context);
            } catch (error) {
                reportError("Credentials clearing failed", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log(
        'Congratulations, your extension "gerrit-workflow" is now active!'
    );

    // Register Commands
    registerAddCredentialCommand(context);
    registerSelectCredentialCommand(context);
    registerClearCredentialsCommand(context);

    // Register views
    loadWorkspaceDefaultConnection(context).then(async () => {
        vscode.window.registerTreeDataProvider(
            "projectsView",
            ProjectsDataProvider.instance()
        );
        await ProjectsDataProvider.instance().refresh();
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}
