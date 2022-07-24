import * as vscode from "vscode";
import { reportError } from "./errorHandling";
import { ProjectsDataProvider } from "./projectsView";
import { hasDefaultConnection, request } from "./request";

export class ChangesDataProvider
    implements vscode.TreeDataProvider<ChangeTreeItem>
{
    private static _instance = new ChangesDataProvider();

    private data: ChangeTreeItem[] = [];

    static instance(): ChangesDataProvider {
        return this._instance;
    }

    async refresh() {
        let project = ProjectsDataProvider.instance().getCurrentProject();
        let label = project ? project.name : "Change";
        this.data = [];
        this.data.push(
            new ChangeTreeItem(
                `${label}${Math.floor(Math.random() * (100 + 1))}`
            )
        );
        this.data.push(
            new ChangeTreeItem(
                `${label}${Math.floor(Math.random() * (100 + 1))}`
            )
        );
        this.data.push(
            new ChangeTreeItem(
                `${label}${Math.floor(Math.random() * (100 + 1))}`
            )
        );
        this._onDidChangeTreeData!.fire();
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        ChangeTreeItem | undefined | void
    > = new vscode.EventEmitter<ChangeTreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<
        ChangeTreeItem | undefined | void
    > = this._onDidChangeTreeData.event;

    getTreeItem(
        element: ChangeTreeItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(
        element?: ChangeTreeItem | undefined
    ): vscode.ProviderResult<ChangeTreeItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}

class ChangeTreeItem extends vscode.TreeItem {
    children = undefined;

    constructor(name: string) {
        // this.children === undefined
        //     ? vscode.TreeItemCollapsibleState.None
        //     : vscode.TreeItemCollapsibleState.Expanded;
        super(name, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "change";
    }
}
