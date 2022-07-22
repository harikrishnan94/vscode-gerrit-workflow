import * as vscode from "vscode";
import normalizeUrl from "normalize-url";
import { TextDecoder, TextEncoder } from "util";

export class Credential {
    serverURL: string;
    username: string;
    accountid: number;
    // Key to retrieve the password from vscode secrets.
    passkey: string;

    // Used in quick pick
    label: string;

    constructor(serverURL: string, self: GetSelfResponse) {
        this.serverURL = normalizeUrl(serverURL, { sortQueryParameters: true });
        this.username = self.username;
        this.accountid = self._account_id;
        this.passkey = Buffer.from(`${serverURL}:${this.username}`).toString(
            "base64"
        );
        this.label = `Server: ${this.serverURL}\nUsername: ${this.username}`;
    }
}

export class GetSelfResponse {
    _account_id: number;
    name: string;
    username: string;
    email: string;

    constructor(
        account_id: number,
        name: string,
        username: string,
        email: string
    ) {
        this._account_id = account_id;
        this.name = name;
        this.username = username;
        this.email = email;
    }
}

let fs = vscode.workspace.fs;
let inUseCredential: Credential | undefined = undefined;

function getCredentialsDBURI(context: vscode.ExtensionContext) {
    return vscode.Uri.joinPath(
        context.globalStorageUri,
        "globalCredentials.json"
    );
}

async function readCredentialsDB(
    context: vscode.ExtensionContext
): Promise<Credential[]> {
    let credentialsStoreDBPath = getCredentialsDBURI(context);
    try {
        let contents = await fs.readFile(credentialsStoreDBPath);
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (e) {
        try {
            await fs.delete(credentialsStoreDBPath, {
                recursive: true,
                useTrash: true,
            });
        } catch (e) {}

        return [];
    }
}

export async function addCredential(
    context: vscode.ExtensionContext,
    serverURL: string,
    self: GetSelfResponse,
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
    await fs.writeFile(
        getCredentialsDBURI(context),
        new TextEncoder().encode(JSON.stringify(credentials))
    );
}

export async function getAllCredentials(
    context: vscode.ExtensionContext
): Promise<Credential[]> {
    return await readCredentialsDB(context);
}

export function setCredentialToUse(credential: Credential) {
    inUseCredential = credential;
}

export function getInUseCredential(): Credential | undefined {
    return inUseCredential;
}
