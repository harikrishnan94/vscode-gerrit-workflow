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

    private currentProject: ProjectTreeItem | undefined;

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
            this.data = [];
            projects.forEach((projectInfo, name) => {
                if (!projectInfo.name) projectInfo.name = name;
                let pos = this.data.push(new ProjectTreeItem(projectInfo)) - 1;
                if (
                    this.currentProject?.projectInfo.name === projectInfo.name
                ) {
                    this.data[pos].markAsCurrent();
                }
            });
            this._onDidChangeTreeData!.fire();
        } catch (error) {
            reportError("Cannot Load Projects", error);
        }
    }

    setCurrentProject(project: string): boolean {
        let pos = this.data.findIndex((p) => p.projectInfo.name == project);
        if (pos == -1) return false;

        if (this.currentProject) this.currentProject.iconPath = undefined;

        this.currentProject = this.data[pos];
        this.currentProject.iconPath = new vscode.ThemeIcon(
            "extensions-star-empty"
        );
        this._onDidChangeTreeData!.fire();
        return true;
    }

    getCurrentProject(): ProjectInfo | undefined {
        return this.currentProject?.projectInfo;
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
    children = undefined;

    constructor(projectInfo: ProjectInfo) {
        // this.children === undefined
        //     ? vscode.TreeItemCollapsibleState.None
        //     : vscode.TreeItemCollapsibleState.Expanded;
        super(projectInfo.name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "project";
        this.command = {
            title: "Switch to this project",
            command: "gerrit-workflow.switchProject",
            arguments: [projectInfo.name],
        };
        this.projectInfo = projectInfo;
        this.description = projectInfo.description;
        this.tooltip = new vscode.MarkdownString(this.generateToolTip());
    }

    markAsCurrent() {
        this.iconPath = new vscode.ThemeIcon("extensions-star-empty");
    }

    private generateToolTip(): string {
        let state = `State: **${this.projectInfo.state}**`;
        let branches = this.projectInfo.branches
            ? `Branches: ${this.projectInfo.branches.join(", ")}<br>`
            : "";

        return state + branches;
    }
}
