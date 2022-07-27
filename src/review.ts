import * as vscode from "vscode";
import { spawnSync } from "child_process";
import { API, GitExtension, Repository } from "./git.api";

export interface GerritReviewConfig {
    serverurl: string;
    username: string;
    project: string;
    defaultbranch: string; // Default: master
    defaultremote: string; // Default: gerrit
}

export function getReviewConfig(): GerritReviewConfig | undefined {
    return vscode.workspace
        .getConfiguration("gerrit-workflow")
        .get<GerritReviewConfig>("gerritReviewConfig");
}

let git: API | undefined;

export function gitExtension(): API {
    if (git) return git;

    const ext = vscode.extensions
        .getExtension<GitExtension>("vscode.git")
        ?.exports.getAPI(1);
    if (!ext) throw new Error("cannot access git extension");

    git = ext;
    return git;
}

async function chooseGitRepositoryUri(
    operationName: string
): Promise<vscode.Uri | undefined> {
    let remote = getReviewConfig()?.defaultremote;
    remote = remote ? remote : defaultremote;

    const hasRemote = (workspaceFolder: vscode.WorkspaceFolder) => {
        const repo = gitExtension().getRepository(workspaceFolder.uri);
        if (repo) {
            if (repo.state.remotes.find((r) => r.name == remote)) return true;
        }
        return false;
    };

    if (vscode.window.activeTextEditor) {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(
            vscode.window.activeTextEditor.document.uri
        );
        if (workspaceFolder) {
            if (hasRemote(workspaceFolder)) return workspaceFolder.uri;
        }
    }

    if (!vscode.workspace.workspaceFolders) return undefined;

    let workspaceFolders: vscode.QuickPickItem[] = [];
    for (const workspaceFolder of vscode.workspace.workspaceFolders!) {
        if (hasRemote(workspaceFolder))
            workspaceFolders.push({
                label: workspaceFolder.uri.toString(),
            });
    }

    if (workspaceFolders.length == 1)
        return vscode.Uri.parse(workspaceFolders[0].label);

    const picked = await vscode.window.showQuickPick(workspaceFolders, {
        title: `Select Git repository for ${operationName}`,
        ignoreFocusOut: true,
    });
    if (!picked) return undefined;

    return vscode.Uri.parse(picked.label);
}

export async function chooseGitRepository(
    operationName: string
): Promise<Repository | undefined> {
    const uri = await chooseGitRepositoryUri(operationName);
    if (!uri) return undefined;

    return gitExtension().getRepository(uri)!;
}

function push(cwd: vscode.Uri, remote: string, branch: string, topic?: string) {
    const command = gitExtension().git.path;
    let ref = `HEAD:refs/for/${branch}`;
    if (topic) ref = `${ref}%topic=${topic}`;

    const child = spawnSync(
        command,
        ["push", "--no-follow-tags", remote, ref],
        {
            cwd: cwd.fsPath,
            encoding: "utf8",
        }
    );

    if (child.status != 0) throw new Error(child.stderr.trim());
}

function getWorkingBranchName(cwd: vscode.Uri): string {
    const command = gitExtension().git.path;
    const child = spawnSync(command, ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: cwd.fsPath,
        encoding: "utf8",
    });

    if (child.status != 0) throw new Error(child.stderr.trim());

    return child.stdout.trim();
}

async function getTopic(workingBranch: string) {
    return await vscode.window.showInputBox({
        prompt: "Enter review topic name",
        value: workingBranch,
        placeHolder:
            "Must start with an alphabet and must only contain alphanumeric, '_' or '-'",
        validateInput: (input) => {
            if (input.match(/^[a-z][a-z0-9_-]+$/)) return undefined;
            return {
                message: "Invalid Topic Name",
                severity: vscode.InputBoxValidationSeverity.Error,
            };
        },
    });
}

const defaultremote = "gerrit";
const defaultbranch = "master";

export async function startReview() {
    let remote = getReviewConfig()?.defaultremote;
    remote = remote ? remote : defaultremote;

    let branch = getReviewConfig()?.defaultbranch;
    branch = branch ? branch : defaultbranch;

    const repoUri = await chooseGitRepositoryUri("Start Review");
    if (!repoUri) throw new Error("cannot locate git repository");

    const workingBranch = await getWorkingBranchName(repoUri);
    const topic = await getTopic(workingBranch);
    if (!topic) return;

    push(repoUri, remote, branch, topic);
}

export async function amendChange() {
    let remote = getReviewConfig()?.defaultremote;
    remote = remote ? remote : defaultremote;

    let branch = getReviewConfig()?.defaultbranch;
    branch = branch ? branch : defaultbranch;

    const repoUri = await chooseGitRepositoryUri("Start Review");
    if (!repoUri) throw new Error("cannot locate git repository");

    push(repoUri, remote, branch, branch);
}
