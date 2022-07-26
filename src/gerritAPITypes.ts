interface AccountInfo {
    _account_id: number;
    name: string;
    email: string;
    username: string;
}

type ReviewerState = "REVIEWER" | "CC" | "REMOVED";

interface ChangeInfo {
    _number: number;
    id: string;
    project: string;
    branch: string;
    topic: string;
    assignee: string;
    change_id: string;
    subject: string;
    status: string;
    created: string;
    updated: string;
    reviewed: boolean | undefined;
    mergeable: boolean | undefined;
    owner: AccountInfo;
    reviewers: [ReviewerState, AccountInfo];
    current_revision: string;
    revisions: any; // Map<string, RevisionInfo>
}

type FetchProtocol = "ssh" | "http" | "git";

type FetchCommand =
    | "Branch"
    | "Checkout"
    | "Cherry Pick"
    | "Format Patch"
    | "Pull"
    | "Reset To";

interface FetchInfo {
    url: string;
    ref: string;
    commands: [FetchCommand, string];
}

interface GitPersonInfo {
    name: string;
    email: string;
}

interface CommitInfo {
    commit: string;
    parents: CommitInfo[];
    author: GitPersonInfo;
    committer: GitPersonInfo;
    subject: string;
    message: string;
}

type FileStatus = "A" | "D" | "R" | "C" | "W";

interface FileInfo {
    status: FileStatus;
    binary: boolean | undefined;
    old_path: string;
    lines_inserted: number;
    lines_deleted: number;
    size_delta: number;
    size: number;
}

interface RevisionInfo {
    _number: number;
    created: string;
    description: string;
    uploader: AccountInfo;
    ref: string;
    fetch: [FetchProtocol, FetchInfo][];
    commit: CommitInfo;
    files: [string, FileInfo];
    reviewed: boolean | undefined;
}
