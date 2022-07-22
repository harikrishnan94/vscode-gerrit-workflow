import { Axios } from "axios";
import { Credential } from "./credentialStore";
import * as vscode from "vscode";
import { assert } from "console";

const axios: Axios = require("axios");

export class Connection {
    credential: Credential;
    password: string;
    constructor(credential: Credential, password: string) {
        this.credential = credential;
        this.password = password;
    }
}

let selectedConnection: Connection | undefined;

export async function setConnection(
    credential: Credential,
    context: vscode.ExtensionContext
): Promise<boolean> {
    let password = await context.secrets.get(credential.passkey);
    if (!password) return false;

    selectedConnection = new Connection(credential, password);

    return true;
}

export async function bareRequest<Result>(
    method: string,
    path: string,
    serverURL: string,
    username: string,
    password: string
): Promise<Result> {
    assert(method === "GET" || method === "PUT");

    let authToken = Buffer.from(`${username}:${password}`).toString("base64");
    let reqOptions = {
        url: `${serverURL}/a/${path}`,
        method: method,
        headers: {
            Accept: "*/*",
            "User-Agent": "VSCode Gerrit WorkFlow",
            Authorization: `Basic ${authToken}`,
        },
    };

    const response = await axios.request<string>(reqOptions);
    return JSON.parse(response.data.split("\n")[1]);
}

export async function request<Result>(
    method: string,
    path: string
): Promise<Result> {
    assert(selectedConnection !== undefined);
    assert(method === "GET" || method === "PUT");

    return await bareRequest<Result>(
        method,
        path,
        selectedConnection!.credential.serverURL,
        selectedConnection!.credential.username,
        selectedConnection!.password
    );
}
