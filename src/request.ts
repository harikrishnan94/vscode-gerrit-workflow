import { Axios, Method, AxiosRequestConfig, ResponseType } from "axios";
import { Credential } from "./credentialStore";
import * as vscode from "vscode";
import { assert } from "console";
import { get, update } from "./dataStore";
import { getOutputChannel } from "./errorHandling";

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

export function getDefaultWorkspaceConnectionURL(): string {
    assert(hasDefaultConnection());
    return workspaceDefaultConnection!.credential.serverURL;
}

export function getUserAccountID(): number {
    assert(hasDefaultConnection());
    return workspaceDefaultConnection!.credential.accountid;
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

function secureClone(obj: AxiosRequestConfig): AxiosRequestConfig {
    let clone: AxiosRequestConfig = JSON.parse(JSON.stringify(obj));

    if (clone.headers) clone.headers.Authorization = "***";
    return clone;
}

function getHttpsRejectUnauthorized(): boolean {
    const rejectUnauthorized = vscode.workspace
        .getConfiguration("gerrit-workflow")
        .get<boolean>("httpsRejectUnauthorized");

    return rejectUnauthorized === undefined ? true : rejectUnauthorized;
}

export async function bareRequest<Result>(
    method: Method,
    serverURL: string,
    username: string,
    password: string,
    path: string,
    responseType: ResponseType = "json",
    params: any = {}
): Promise<Result> {
    assert(method === "GET" || method === "PUT");

    const https = require("https");
    const authToken = Buffer.from(`${username}:${password}`).toString("base64");
    const reqOptions: AxiosRequestConfig = {
        url: `${serverURL}/a/${path}`,
        method: method,
        headers: {
            Accept: "*/*",
            "User-Agent": "VSCode Gerrit WorkFlow",
            Authorization: `Basic ${authToken}`,
        },
        responseType,
        params: params,
        httpsAgent: new https.Agent({
            rejectUnauthorized: getHttpsRejectUnauthorized(),
        }),
    };

    getOutputChannel().appendLine(
        `Executing Request: ${JSON.stringify(secureClone(reqOptions))}\n`
    );

    if (responseType == "json") {
        const response = await axios.request<string>(reqOptions);
        return JSON.parse(response.data.split("\n")[1]);
    } else {
        return await (
            await axios.request<Result>(reqOptions)
        ).data;
    }
}

export async function request<Result>(
    method: Method,
    path: string,
    responseType: ResponseType = "json",
    params: any = {}
): Promise<Result> {
    assert(workspaceDefaultConnection !== undefined);
    assert(method === "GET" || method === "PUT");

    return await bareRequest<Result>(
        method,
        workspaceDefaultConnection!.credential.serverURL,
        workspaceDefaultConnection!.credential.username,
        workspaceDefaultConnection!.password,
        path,
        responseType,
        params
    );
}
