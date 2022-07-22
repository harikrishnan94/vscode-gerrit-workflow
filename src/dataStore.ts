import * as vscode from "vscode";

const keyPrefix = "gerrit-workflow";

export function get<T>(
    context: vscode.ExtensionContext,
    key: string
): T | undefined {
    return context.globalState.get<T>(`${keyPrefix}/${key}`);
}

export async function update<T>(
    context: vscode.ExtensionContext,
    key: string,
    value: T
): Promise<void> {
    await context.globalState.update(`${keyPrefix}/${key}`, value);
}
