import * as vscode from "vscode";

const keyPrefix = "gerrit-workflow";

type WorkspaceOrGlobal = "InWorkspace" | "InGlobal";

export function get<T>(
    key: string,
    context: vscode.ExtensionContext,
    scope: WorkspaceOrGlobal = "InGlobal"
): T | undefined {
    if (scope == "InGlobal")
        return context.globalState.get<T>(`${keyPrefix}/${key}`);
    return context.workspaceState.get<T>(`${keyPrefix}/${key}`);
}

export async function update<T>(
    key: string,
    value: T,
    context: vscode.ExtensionContext,
    scope: WorkspaceOrGlobal = "InGlobal"
): Promise<void> {
    if (scope == "InGlobal")
        await context.globalState.update(`${keyPrefix}/${key}`, value);
    await context.workspaceState.update(`${keyPrefix}/${key}`, value);
}
