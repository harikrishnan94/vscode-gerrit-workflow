import { AxiosError } from "axios";
import * as vscode from "vscode";

export function reportError(
    errorContext: string,
    error: AxiosError | Error | any
) {
    const reportError = (msg: string) => {
        vscode.window.showErrorMessage(`${errorContext}: ${msg}`);
    };
    if (error instanceof AxiosError) {
        reportError(`${error.message}(${error.response?.statusText!})`);
    } else if (error instanceof Error) {
        reportError(error.message);
    } else {
        reportError(JSON.stringify(error));
    }
}
