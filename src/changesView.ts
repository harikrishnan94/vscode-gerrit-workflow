import * as vscode from "vscode";
import { getDefaultWorkspaceConnectionURL, request } from "./request";

export class TreeItem extends vscode.TreeItem {
    parent: TreeItem | undefined;
    children: TreeItem[] = [];

    constructor(
        collapsibleState: vscode.TreeItemCollapsibleState,
        parent: TreeItem | undefined,
        label: string,
        description: string,
        tooltip: vscode.MarkdownString,
        contextValue: string
    ) {
        super(label, collapsibleState);
        this.parent = parent;
        this.description = description;
        this.tooltip = tooltip;
        this.contextValue = contextValue;
    }
}

export class ChangeCategoryTreeItem extends TreeItem {
    constructor(label: string, changes: ChangeInfo[]) {
        super(
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            label,
            "",
            new vscode.MarkdownString(),
            "changeCategory"
        );

        this.populateChildren(changes);
    }

    populateChildren(changes: ChangeInfo[]) {
        for (let change of changes) {
            this.children.push(new ChangeTreeItem(change, this));
        }
    }
}

export class ChangeTreeItem extends TreeItem {
    changeInfo: ChangeInfo;

    constructor(changeInfo: ChangeInfo, parent: ChangeCategoryTreeItem) {
        super(
            vscode.TreeItemCollapsibleState.Collapsed,
            parent,
            `${changeInfo._number}`,
            changeInfo.subject,
            ChangeTreeItem.generateTooltip(changeInfo),
            "change"
        );
        this.changeInfo = changeInfo;

        this.populateChildren(Object.entries(changeInfo.revisions));
    }

    populateChildren(revisions: [string, RevisionInfo][]) {
        // Sort by latest created time.
        revisions = revisions.sort((revision1, revision2) => {
            const created1 = Date.parse(revision1[1].created);
            const created2 = Date.parse(revision2[1].created);
            if (created1 < created2) return 1;
            if (created1 > created2) return -1;
            return 0;
        });

        let i = revisions.length;
        for (let revision of revisions) {
            this.children.push(
                new PatchSetTreeItem(i, revision[0], revision[1], this)
            );
            i--;
        }
    }

    async copyCommitMessage() {
        const changeInfo = this.changeInfo;
        const currentRevision: RevisionInfo =
            changeInfo.revisions[changeInfo.current_revision];
        await vscode.env.clipboard.writeText(currentRevision.commit.message);
    }

    async copyChangeLinkToClipboard() {
        await vscode.env.clipboard.writeText(this.getChangeLink());
    }

    async openChangeInBrowser(): Promise<boolean> {
        return await vscode.env.openExternal(
            vscode.Uri.parse(this.getChangeLink(), true)
        );
    }

    async downloadLatestPatchset() {
        await (this.children[0] as PatchSetTreeItem).download();
    }

    async checkoutLatestPatchset() {
        await (this.children[0] as PatchSetTreeItem).checkout();
    }

    private getChangeLink(): string {
        const serverURL = getDefaultWorkspaceConnectionURL();
        return `${serverURL}/c/${this.changeInfo.project}/+/${this.changeInfo._number}`;
    }

    private static generateTooltip(
        changeInfo: ChangeInfo
    ): vscode.MarkdownString {
        const currentRevision: RevisionInfo =
            changeInfo.revisions[changeInfo.current_revision];
        const changeId = `ChangeID: **${changeInfo.change_id}**\n\n`;
        const topic = `Topic: **${changeInfo.topic}**\n\n`;
        const branch = `Branch: **${changeInfo.branch}**\n\n`;
        const project = `Project: **${changeInfo.project}**\n\n`;
        const created = `Created at: **${changeInfo.created}**\n\n`;
        const commitMessage = `${currentRevision.commit.message}\n\n`;

        return new vscode.MarkdownString(
            `${changeId}${topic}${branch}${project}${created}${commitMessage}`
        );
    }
}

export class PatchSetTreeItem extends TreeItem {
    revisionNumber: number;
    revisionID: string;
    revisionInfo: RevisionInfo;

    constructor(
        revisionNumber: number,
        revisionID: string,
        revisionInfo: RevisionInfo,
        parent: ChangeTreeItem
    ) {
        super(
            vscode.TreeItemCollapsibleState.Collapsed,
            parent,
            `${revisionNumber}`,
            revisionInfo.description,
            PatchSetTreeItem.generateTooltip(revisionID, revisionInfo),
            "patchset"
        );

        this.revisionNumber = revisionNumber;
        this.revisionID = revisionID;
        this.revisionInfo = revisionInfo;
    }

    async copyCommitSHA() {
        await vscode.env.clipboard.writeText(this.revisionID);
    }

    async download() {
        const shortRevisionID = this.revisionID.substring(0, 7);
        const prefixPath = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0].uri.fsPath
            : "~/Downloads";
        const downloadLocation = await vscode.window.showSaveDialog({
            saveLabel: `Download patchset for ${this.revisionInfo.commit.subject}`,
            defaultUri: vscode.Uri.parse(
                `${prefixPath}/${shortRevisionID}.zip`
            ),
        });

        if (!downloadLocation) return;

        const changeID = (this.parent as ChangeTreeItem).changeInfo.id;
        const revisionID = this.revisionID;

        let patch = await request<ArrayBuffer>(
            "GET",
            `changes/${changeID}/revisions/${revisionID}/patch?zip`,
            "arraybuffer"
        );

        await vscode.workspace.fs.writeFile(
            downloadLocation,
            new Uint8Array(patch)
        );
    }

    async checkout() {
        // TODO: Implement
        vscode.window.showInformationMessage(
            `Checking out changes for ${this.revisionID}`
        );
    }

    private static generateTooltip(
        revisionID: string,
        revisionInfo: RevisionInfo
    ): vscode.MarkdownString {
        const createdAt = `Created at **${revisionInfo.created}**\n\n`;
        const commitInfo = `Commit SHA: **${revisionID}**\n\n`;
        const commitMessage = `${revisionInfo.commit.message}**\n\n`;

        return new vscode.MarkdownString(
            `${createdAt}${commitInfo}${commitMessage}`
        );
    }
}

export class ChangesDataProvider implements vscode.TreeDataProvider<TreeItem> {
    private static _instance = new ChangesDataProvider();

    private data: TreeItem[] = [];

    private defaultParams =
        "o=ALL_REVISIONS&o=ALL_COMMITS&o=ALL_FILES&o=DOWNLOAD_COMMANDS&o=REVIEWED&o=WEB_LINKS&o=DETAILED_LABELS";
    private yourTurnViewQuery = "attention:self";
    private outgoingReviewsQuery = "is:open owner:self -is:wip -is:ignored";
    private incomingReviewsQuery =
        "is:open -owner:self -is:wip -is:ignored reviewer:self";
    private ccedOnQuery = "is:open -is:ignored -is:wip cc:self";

    static instance(): ChangesDataProvider {
        return this._instance;
    }

    async refresh() {
        this.data = [];
        await this.loadChanges();
        this._onDidChangeTreeData!.fire();
    }

    private async loadChanges() {
        const yourTurn = await this.createCategoryTree(
            "Your Turn",
            this.yourTurnViewQuery
        );
        const outgoingReviews = await this.createCategoryTree(
            "Outgoing Reviews",
            this.outgoingReviewsQuery
        );
        const incomingReviews = await this.createCategoryTree(
            "Incoming Reviews",
            this.incomingReviewsQuery
        );
        const ccedOn = await this.createCategoryTree(
            "CCed On",
            this.ccedOnQuery
        );

        this.data.push(yourTurn, outgoingReviews, incomingReviews, ccedOn);
    }

    private async createCategoryTree(name: string, query: string) {
        const path = `changes/?${this.defaultParams}&q=${query}`;
        const changes = await request<ChangeInfo[]>("GET", path);
        return new ChangeCategoryTreeItem(name, changes);
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        TreeItem | undefined | void
    > = new vscode.EventEmitter<TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    getTreeItem(
        element: TreeItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(
        element?: TreeItem | undefined
    ): vscode.ProviderResult<TreeItem[]> {
        if (element === undefined) {
            return this.data;
        }
        return element.children;
    }
}
