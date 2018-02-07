export interface Discussion {
    id: string;
}

export interface Message {
    id: string;
    message: object;
    userId: string;
    user?: {
        displayName: string;
        photoURL: string;
    };
    discussionId: string;
    modified?: Date;
    created?: Date;
}
