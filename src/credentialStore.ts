import * as vscode from "vscode";
import normalizeUrl from "normalize-url";
import { get, update } from "./dataStore";

export class Credential {
    serverURL: string;
    username: string;
    accountid: number;
    // Key to retrieve the password from vscode secrets.
    passkey: string;

    constructor(serverURL: string, self: SelfResponse) {
        this.serverURL = normalizeUrl(serverURL, { sortQueryParameters: true });
        this.username = self.username;
        this.accountid = self._account_id;
        this.passkey = Buffer.from(`${serverURL}:${this.username}`).toString(
            "base64"
        );
    }
}

export interface SelfResponse {
    _account_id: number;
    name: string;
    username: string;
    email: string;
}

let fs = vscode.workspace.fs;
const credentialsKey = "credentials";

async function readCredentialsDB(
    context: vscode.ExtensionContext
): Promise<Credential[]> {
    let credentials = get<Credential[]>(credentialsKey, context);
    if (credentials) return credentials!;
    return [];
}

export async function addCredential(
    context: vscode.ExtensionContext,
    serverURL: string,
    self: SelfResponse,
    password: string
) {
    const credential = new Credential(serverURL, self);
    let credentials = await readCredentialsDB(context);
    let credentialIndex = credentials.findIndex((cred) => {
        return cred.passkey == credential.passkey;
    });

    // Passwords are stored in vscode secrets and key to the secret is stored in `CredentialsDatabase`.
    if (credentialIndex == -1) {
        credentials.push(credential);
    }
    await context.secrets.store(credential.passkey, password);
    await update(credentialsKey, credentials, context);
}

export async function getAllCredentials(
    context: vscode.ExtensionContext
): Promise<Credential[]> {
    return await readCredentialsDB(context);
}

export async function clearCredentials(context: vscode.ExtensionContext) {
    await update(credentialsKey, [], context);
}
