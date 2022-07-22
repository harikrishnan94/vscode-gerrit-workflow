import { Axios, Method, AxiosRequestConfig } from "axios";
import { Credential } from "./credentialStore";
import * as vscode from "vscode";
import { assert } from "console";
import { get, update } from "./dataStore";

const axios: Axios = require("axios");

export class Connection {
    credential: Credential;
    password: string;
    constructor(credential: Credential, password: string) {
        this.credential = credential;
        this.password = password;
    }
}

const defaultCredentialKey = "defaultCredential";
let workspaceDefaultConnection: Connection | undefined;

export async function loadWorkspaceDefaultConnection(
    context: vscode.ExtensionContext
) {
    const credential = get<Credential>(
        defaultCredentialKey,
        context,
        "InWorkspace"
    );

    if (credential) await setWorspaceDefaultConnection(credential, context);
}

export function hasDefaultConnection(): boolean {
    return workspaceDefaultConnection !== undefined;
}

export async function setWorspaceDefaultConnection(
    credential: Credential,
    context: vscode.ExtensionContext
): Promise<boolean> {
    let password = await context.secrets.get(credential.passkey);
    if (!password) return false;

    workspaceDefaultConnection = new Connection(credential, password);
    await update(defaultCredentialKey, credential, context, "InWorkspace");

    return true;
}

export async function bareRequest<Result>(
    method: Method,
    path: string,
    serverURL: string,
    username: string,
    password: string
): Promise<Result> {
    assert(method === "GET" || method === "PUT");

    let authToken = Buffer.from(`${username}:${password}`).toString("base64");
    let reqOptions: AxiosRequestConfig = {
        url: `${serverURL}/a/${path}`,
        method: method,
        headers: {
            Accept: "*/*",
            "User-Agent": "VSCode Gerrit WorkFlow",
            Authorization: `Basic ${authToken}`,
        },
        responseType: "json",
    };

    const response = await axios.request<string>(reqOptions);
    return JSON.parse(response.data.split("\n")[1]);
}

export async function request<Result>(
    method: Method,
    path: string
): Promise<Result> {
    assert(workspaceDefaultConnection !== undefined);
    assert(method === "GET" || method === "PUT");

    return await bareRequest<Result>(
        method,
        path,
        workspaceDefaultConnection!.credential.serverURL,
        workspaceDefaultConnection!.credential.username,
        workspaceDefaultConnection!.password
    );
}
