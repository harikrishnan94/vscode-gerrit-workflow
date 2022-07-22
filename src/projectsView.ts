import * as vscode from "vscode";
import { reportError } from "./errorHandling";
import { hasDefaultConnection, request } from "./request";

interface WebLinkInfo {
    name: string;
    url: string;
}

type ProjectState = "ACTIVE" | "READONLY" | "HIDDEN";

interface ProjectInfo {
    id: string;
    name: string;
    description: string;
    branches: string[];
    state: ProjectState;
    web_links: WebLinkInfo[];
}

export class ProjectsDataProvider
    implements vscode.TreeDataProvider<ProjectTreeItem>
{
    private static _instance = new ProjectsDataProvider();

    private data: ProjectTreeItem[] = [];

    static instance(): ProjectsDataProvider {
        return this._instance;
    }

    async refresh() {
        if (!hasDefaultConnection()) return;

        try {
            const response = await request<any>("GET", "projects/?d");
            const projects = new Map<string, ProjectInfo>(
                Object.entries(response)
            );
            projects.forEach((projectInfo, name) => {
                this.data.push(new ProjectTreeItem(projectInfo, name));
            });
            this._onDidChangeTreeData!.fire();
        } catch (error) {
            reportError("Cannot Load Projects", error);
        }
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        ProjectTreeItem | undefined | void
    > = new vscode.EventEmitter<ProjectTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<
        ProjectTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    getTreeItem(
        element: ProjectTreeItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(
        element?: ProjectTreeItem | undefined
    ): vscode.ProviderResult<ProjectTreeItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}

class ProjectTreeItem extends vscode.TreeItem {
    projectInfo: ProjectInfo;
    name: string;
    children = undefined;

    constructor(projectInfo: ProjectInfo, name: string) {
        // this.children === undefined
        //     ? vscode.TreeItemCollapsibleState.None
        //     : vscode.TreeItemCollapsibleState.Expanded;
        super(name, vscode.TreeItemCollapsibleState.None);
        this.projectInfo = projectInfo;
        this.name = name;
    }
}
