export interface PublicUser {
    id?: string;
    displayName: string;
    photoURL?: string;
    isAdmin: boolean;
}

export interface User extends PublicUser {
    email: string;
    source: string;
    sourceId: string;
}

export interface UserToken {
    id: string;
}
