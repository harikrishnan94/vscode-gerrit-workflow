import * as vscode from "vscode";
import { get, update } from "./dataStore";
import { getDefaultWorkspaceConnectionURL, request } from "./request";
import { chooseGitRepository } from "./review";

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
    constructor(
        label: string,
        changes: ChangeInfo[],
        context: string = "changeCategory"
    ) {
        super(
            vscode.TreeItemCollapsibleState.Expanded,
            undefined,
            label,
            "",
            new vscode.MarkdownString(),
            context
        );

        this.populateChildren(changes);
    }

    populateChildren(changes: ChangeInfo[]) {
        for (let change of changes) {
            this.children.push(new ChangeTreeItem(change, this));
        }
    }

    add(change: ChangeInfo) {
        this.children.push(new ChangeTreeItem(change, this));
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

    async compareWith() {
        await (this.children[0] as PatchSetTreeItem).compareWith();
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
        await (this.children[0] as PatchSetTreeItem).checkout(true);
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
        const created = `Created at: **${new Date(
            Date.parse(`${changeInfo.created} GMT`)
        ).toLocaleString()}**\n\n`;
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
            vscode.TreeItemCollapsibleState.None,
            parent,
            `${revisionNumber}`,
            revisionInfo.description,
            PatchSetTreeItem.generateTooltip(revisionID, revisionInfo),
            "patchset"
        );

        this.revisionNumber = revisionNumber;
        this.revisionID = revisionID;
        revisionInfo.fetch = Object.entries<FetchInfo>(
            revisionInfo.fetch as any
        ) as [FetchProtocol, FetchInfo][];
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

    async copyRemoteReference() {
        const remoteRef = this.getRemoteInfo();
        await vscode.env.clipboard.writeText(remoteRef.join(" "));
    }

    async compareWith() {
        const repo = await chooseGitRepository("Compare with");
        if (!repo) throw new Error(`cannot locate git repository.`);

        const remote = this.getRemoteInfo();
        await repo.fetch({ remote: remote[0], ref: remote[1] });

        const commit = await repo.getCommit("FETCH_HEAD");

        await vscode.commands.executeCommand("gitlens.compareWith", {
            ref1: commit.hash,
        });
    }

    async checkout(forReview: boolean = false) {
        const repo = await chooseGitRepository("Checkout");
        if (!repo) throw new Error(`cannot locate git repository.`);

        const remote = this.getRemoteInfo();
        await repo.fetch({ remote: remote[0], ref: remote[1] });

        const changeInfo = (this.parent as ChangeTreeItem).changeInfo;
        const branchNamePrefix = "review";
        const changeNumber = changeInfo._number;
        const revisionNumber = this.revisionNumber;

        try {
            const suffix = changeInfo.topic
                ? changeInfo.topic
                : `${changeNumber}`;
            let reviewBranchName = `${branchNamePrefix}/${suffix}`;
            if (!forReview)
                reviewBranchName = `${reviewBranchName}/${revisionNumber}`;

            await repo.createBranch(reviewBranchName, true, "FETCH_HEAD");
        } catch (error: any) {
            throw new Error(error.stderr);
        }
    }

    private getRemoteInfo(): string[] {
        const ssh = this.revisionInfo.fetch.find((item) => {
            return item[0] == "ssh";
        });
        if (ssh === undefined)
            throw new Error("Cannot find fetch commands for SSH protocol");
        return [ssh[1].url, ssh[1].ref];
    }

    private static generateTooltip(
        revisionID: string,
        revisionInfo: RevisionInfo
    ): vscode.MarkdownString {
        const createdAt = `Created at **${new Date(
            Date.parse(`${revisionInfo.created} GMT`)
        ).toLocaleString()}**\n\n`;
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
    private context: vscode.ExtensionContext | undefined;

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

    async refresh(context: vscode.ExtensionContext) {
        this.data = [];
        this.context = context;
        this._onDidChangeTreeData!.fire();
    }

    private async loadChanges(context: vscode.ExtensionContext) {
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
        const favouriteChanges = await this.createFavouriteChangesCategoryTree(
            context
        );

        this.data.push(
            yourTurn,
            outgoingReviews,
            incomingReviews,
            ccedOn,
            favouriteChanges
        );
    }

    private favouriteChangesKey = "favouriteChanges";

    async addFavouriteChange(context: vscode.ExtensionContext) {
        let favouriteChanges = this.getFavouriteChanges(context);
        const changeNumber = await this.getChangeToAdd();
        if (!changeNumber) return;

        favouriteChanges.add(changeNumber);
        await this.updateFavouriteChanges(context, favouriteChanges);
        await this.refresh(context);
    }

    async clearFavouriteChanges(context: vscode.ExtensionContext) {
        await this.updateFavouriteChanges(context, new Set<number>());
        await this.refresh(context);
    }

    private async createCategoryTree(name: string, query: string) {
        const path = `changes/?${this.defaultParams}&q=${query}`;
        const changes = await request<ChangeInfo[]>("GET", path);
        return new ChangeCategoryTreeItem(name, changes);
    }

    private async createFavouriteChangesCategoryTree(
        context: vscode.ExtensionContext
    ) {
        const create = (changes: ChangeInfo[]) => {
            return new ChangeCategoryTreeItem(
                "Favourites",
                changes,
                "favouriteChanges"
            );
        };
        let favouriteChanges = this.getFavouriteChanges(context);
        if (favouriteChanges.size == 0) return create([]);

        let query = "";
        favouriteChanges.forEach((changeNumber) => {
            query += `&q=change:${changeNumber}`;
        });

        const path = `changes/?${this.defaultParams}${query}`;
        const changes = await request<ChangeInfo[]>("GET", path);

        return create(
            changes.flatMap((change) => {
                return change;
            })
        );
    }

    private async getChangeToAdd(): Promise<number | undefined> {
        const pickItems = async (): Promise<vscode.QuickPickItem[]> => {
            const changes = await request<ChangeInfo[]>(
                "GET",
                "changes/?o=CURRENT_REVISION&o=CURRENT_COMMIT"
            );
            const pickItems = changes.map((change) => {
                let message: string =
                    change.revisions[change.current_revision].commit.message;
                message = message.split("\n").splice(1).join("\n");
                return {
                    label: `${change._number}`,
                    description: change.subject.trim(),
                    detail: message.trim(),
                };
            });
            return pickItems;
        };
        const picked = await vscode.window.showQuickPick(pickItems(), {
            title: "Select Change to add as favourite",
            matchOnDescription: true,
            matchOnDetail: true,
        });
        return parseInt(picked?.label!);
    }

    private getFavouriteChanges(context: vscode.ExtensionContext): Set<number> {
        const favouriteChanges = get<string>(
            this.favouriteChangesKey,
            context,
            "InWorkspace"
        );
        if (favouriteChanges === undefined || favouriteChanges == "")
            return new Set<number>();

        return new Set<number>(
            favouriteChanges.split(",").map((number) => parseInt(number))
        );
    }

    private async updateFavouriteChanges(
        context: vscode.ExtensionContext,
        favourites: Set<number>
    ) {
        if (favourites.size == 0) {
            await update<string>(
                this.favouriteChangesKey,
                "",
                context,
                "InWorkspace"
            );
        }
        const favouriteChanges = Array.from(favourites.keys()).join(",");

        await update<string>(
            this.favouriteChangesKey,
            favouriteChanges,
            context,
            "InWorkspace"
        );
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
            return this.loadChanges(this.context!).then(() => {
                return this.data;
            });
        }
        return element.children;
    }
}
