import { AxiosError } from "axios";
import * as vscode from "vscode";

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
    if (outputChannel === undefined)
        outputChannel = vscode.window.createOutputChannel("Gerrit Workflow");

    return outputChannel;
}

export function reportError(
    errorContext: string,
    error: AxiosError | Error | any
) {
    const reportError = (msg: string) => {
        let errmsg = `${errorContext}: ${msg}`;

        getOutputChannel().appendLine(`ERROR: ${errmsg}\n`);
        vscode.window.showErrorMessage(errmsg);
    };
    if (error instanceof AxiosError) {
        reportError(`${error.message}(${error.response?.statusText!})`);
    } else if (error instanceof Error) {
        reportError(error.message);
    } else {
        reportError(JSON.stringify(error));
    }
}
