import * as vscode from "vscode";
import { reportError } from "./errorHandling";
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
        this.data.push(new ChangeTreeItem("1001"));
        this.data.push(new ChangeTreeItem("1002"));
        this.data.push(new ChangeTreeItem("1003"));
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
