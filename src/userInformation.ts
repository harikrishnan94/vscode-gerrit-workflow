import * as vscode from 'vscode';
import normalizeUrl from 'normalize-url'
import { TextDecoder, TextEncoder } from 'util';
import { fstat } from 'fs';

class User {
    serverURL: string
    username: string
    accountid: number
    // Key to retrieve the password from vscode secrets.
    passkey: string

    constructor(serverURL: string, self: GetSelfResponse) {
        this.serverURL = normalizeUrl(serverURL, { sortQueryParameters: true });
        this.username = self.username;
        this.accountid = self._account_id;
        this.passkey = Buffer.from(`${serverURL}:${this.username}`).toString('base64');
    }
}

class GetSelfResponse {
    _account_id: number
    name: string
    username: string
    email: string

    constructor(account_id: number, name: string, username: string, email: string) {
        this._account_id = account_id;
        this.name = name;
        this.username = username;
        this.email = email;
    }
}

let fs = vscode.workspace.fs;

function getUsersDBURI(context: vscode.ExtensionContext) {
    return vscode.Uri.joinPath(context.globalStorageUri, "globalUsers.json");
}

async function readUsersDB(context: vscode.ExtensionContext): Promise<User[]> {
    let usersStoreDBPath = getUsersDBURI(context);
    try {
        let contents = await fs.readFile(usersStoreDBPath);
        return JSON.parse(new TextDecoder().decode(contents));
    } catch (e) {
        try {
            await fs.delete(usersStoreDBPath, { recursive: true, useTrash: true });
        } catch (e) { }

        return [];
    }
}

export async function updateUserInformation(context: vscode.ExtensionContext, serverURL: string, self: GetSelfResponse, password: string) {
    const user = new User(serverURL, self);
    let users = await readUsersDB(context);
    let userIndex = users.findIndex((dbuser) => { return dbuser.passkey == user.passkey; });

    // Passwords are stored in vscode secrets and key to the secret is stored in `UsersDatabase`.
    if (userIndex == -1) { users.push(user); }
    await context.secrets.store(user.passkey, password);
    await fs.writeFile(getUsersDBURI(context), new TextEncoder().encode(JSON.stringify(users)));
}

