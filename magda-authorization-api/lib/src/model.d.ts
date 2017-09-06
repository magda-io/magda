export interface PublicUser {
    id?: string;
    displayName: string;
    photoURL?: string;
}
export interface User extends PublicUser {
    email: string;
    source: string;
    sourceId: string;
}
