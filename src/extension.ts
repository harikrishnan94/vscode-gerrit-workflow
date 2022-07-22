// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { Axios, AxiosError } from "axios";
import * as vscode from "vscode";
import {
    addCredential,
    clearCredentials,
    getAllCredentials,
    setCredentialToUse,
    validateCredential,
} from "./credentialStore";

const axios: Axios = require("axios");

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
                let authToken = Buffer.from(`${username}:${password}`).toString(
                    "base64"
                );

                let reqOptions = {
                    url: serverUrl + "/a/accounts/self",
                    method: "GET",
                    headers: {
                        Accept: "*/*",
                        "User-Agent": "VSCode Gerrit WorkFlow",
                        Authorization: `Basic ${authToken}`,
                    },
                };

                const response = await axios.request<string>(reqOptions);
                await addCredential(
                    context,
                    serverUrl,
                    JSON.parse(response.data.split("\n")[1]),
                    password
                );
                vscode.window.showInformationMessage("Credential Saved!");
            } catch (error) {
                const reportError = (msg: string) => {
                    vscode.window.showErrorMessage(
                        `Credentials verification failed: ${msg}`
                    );
                };
                if (error instanceof AxiosError) {
                    reportError(
                        `${error.message}(${error.response?.statusText!})`
                    );
                } else if (error instanceof Error) {
                    reportError(error.message);
                } else {
                    reportError(JSON.stringify(error));
                }
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
        console.log(`Credential selected ${userPick.label}`);

        if (await validateCredential(context, userPick.credential)) {
            setCredentialToUse(userPick.credential);
        } else {
            vscode.window.showErrorMessage(
                `Cannot find password for: ${userPick.label}`
            );
        }
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
                const reportError = (msg: string) => {
                    vscode.window.showErrorMessage(
                        `Credentials selection failed: ${msg}`
                    );
                };
                if (error instanceof Error) {
                    reportError(error.message);
                } else {
                    reportError(JSON.stringify(error));
                }
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
                const reportError = (msg: string) => {
                    vscode.window.showErrorMessage(
                        `Credentials clearing failed: ${msg}`
                    );
                };
                if (error instanceof Error) {
                    reportError(error.message);
                } else {
                    reportError(JSON.stringify(error));
                }
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
    registerAddCredentialCommand(context);
    registerSelectCredentialCommand(context);
    registerClearCredentialsCommand(context);
}

// this method is called when your extension is deactivated
export function deactivate() {}
