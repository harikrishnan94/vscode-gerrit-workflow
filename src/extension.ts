// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { ChangesDataProvider } from "./changesView";
import {
    addCredential,
    clearCredentials,
    getAllCredentials,
    SelfResponse as SelfResponse,
} from "./credentialStore";
import { reportError } from "./errorHandling";
import { ChangeTreeItem, PatchSetTreeItem } from "./changesView";
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
                    serverUrl,
                    username,
                    password,
                    "accounts/self"
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
    const quickPickItems = async (): Promise<any[]> => {
        const credentials = await getAllCredentials(context);
        return credentials.map((cred) => {
            return {
                label: `Username: ${cred.username}`,
                detail: `Server URL: ${cred.serverURL}`,
                credential: cred,
            };
        });
    };
    const userPick = await vscode.window.showQuickPick(quickPickItems(), {
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
        await ChangesDataProvider.instance().refresh(context);
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

function registerRefreshChangesViewCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.refreshChangesView",
        async () => {
            try {
                await ChangesDataProvider.instance().refresh(context);
            } catch (error) {
                reportError("Cannot Refresh Changes", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerCopyCommitMessage(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.copyCommitMessage",
        async (change: ChangeTreeItem) => {
            try {
                await change.copyCommitMessage();
            } catch (error) {
                reportError("Cannot copy change info to clipboard", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerCopyChangeLinkToClipboardCommand(
    context: vscode.ExtensionContext
) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.copyChangeLinkToClipboard",
        async (change: ChangeTreeItem) => {
            try {
                await change.copyChangeLinkToClipboard();
            } catch (error) {
                reportError("Cannot copy change link to clipboard", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerOpenChangeInBrowserCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.openChangeInBrowser",
        async (change: ChangeTreeItem) => {
            try {
                let success = await change.openChangeInBrowser();
                if (!success)
                    vscode.window.showErrorMessage(
                        "Failed to open change in browser"
                    );
            } catch (error) {
                reportError("Cannot open change in browser", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerDownloadLatestPatchsetForChangeCommand(
    context: vscode.ExtensionContext
) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.downloadLatestPatchsetForChange",
        async (change: ChangeTreeItem) => {
            try {
                change.downloadLatestPatchset();
            } catch (error) {
                reportError("Cannot download patchset", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerCheckoutLatestPatchsetForChangeCommand(
    context: vscode.ExtensionContext
) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.checkoutLatestPatchsetForChange",
        async (change: ChangeTreeItem) => {
            try {
                await change.checkoutLatestPatchset();
            } catch (error) {
                reportError("Cannot checkout patchset", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerCopyCommitSHA(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.copyCommitSHA",
        async (patchset: PatchSetTreeItem) => {
            try {
                await patchset.copyCommitSHA();
            } catch (error) {
                reportError("Cannot copy patchset info to clipboard", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerDownloadPatchsetCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.downloadPatchset",
        async (patchset: PatchSetTreeItem) => {
            try {
                await patchset.download();
            } catch (error) {
                reportError("Cannot download patchset", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerCheckoutPatchsetCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.checkoutPatchset",
        async (patchset: PatchSetTreeItem) => {
            try {
                await patchset.checkout();
            } catch (error) {
                reportError("Cannot checkout patchset", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerAddFavouriteChangeCommand(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.addFavouriteChange",
        async () => {
            try {
                await ChangesDataProvider.instance().addFavouriteChange(
                    context
                );
            } catch (error) {
                reportError("Cannot add change to favourites", error);
            }
        }
    );

    context.subscriptions.push(disposable);
}

function registerClearFavouriteChangesCommand(
    context: vscode.ExtensionContext
) {
    let disposable = vscode.commands.registerCommand(
        "gerrit-workflow.clearFavouriteChanges",
        async () => {
            try {
                await ChangesDataProvider.instance().clearFavouriteChanges(
                    context
                );
            } catch (error) {
                reportError("Cannot clear favourites", error);
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
    registerRefreshChangesViewCommand(context);
    registerCopyCommitMessage(context);
    registerCopyChangeLinkToClipboardCommand(context);
    registerOpenChangeInBrowserCommand(context);
    registerDownloadLatestPatchsetForChangeCommand(context);
    registerCheckoutLatestPatchsetForChangeCommand(context);
    registerCopyCommitSHA(context);
    registerDownloadPatchsetCommand(context);
    registerCheckoutPatchsetCommand(context);
    registerAddFavouriteChangeCommand(context);
    registerClearFavouriteChangesCommand(context);

    // Register views
    loadWorkspaceDefaultConnection(context).then(async () => {
        vscode.window.registerTreeDataProvider(
            "changesView",
            ChangesDataProvider.instance()
        );

        try {
            await ChangesDataProvider.instance().refresh(context);
        } catch (error) {
            reportError("Cannot refresh changes", error);
        }
    });
}

// this method is called when your extension is deactivated
export function deactivate() {}
