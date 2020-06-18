declare global {
    namespace Express {
        interface User extends MagdaUser {}
    }
}

// Exporting MagdaUser as PublicUser because it's not guaranteed
// that user will have email, source, sourceId, etc
// Make it export `User` if that's more appropriate
export type MagdaUser = PublicUser;

export interface PublicUser {
    id?: string;
    displayName: string;
    photoURL?: string;
    isAdmin: boolean;
    roles?: Role[];
    permissions?: Permission[];
    managingOrgUnitIds?: string[];
    orgUnit?: OrgUnit;
}

export interface OrgUnit {
    id?: string;
    name?: string;
    description?: string;
    left?: number;
    right?: number;
    createBy?: string;
    createTime?: Date;
    editBy?: string;
    editTime?: Date;
}

export interface User extends PublicUser {
    email: string;
    source: string;
    sourceId: string;
}

export interface Role {
    id: string;
    name: string;
    permissionIds: string[];
    description?: string;
    createBy?: string;
    createTime?: Date;
    editBy?: string;
    editTime?: Date;
}

export interface Operation {
    id: string;
    uri: string;
    name: string;
    description?: string;
}

export interface Permission {
    id: string;
    name: string;
    description?: string;
    resourceId: string;
    resourceUri: string;
    userOwnershipConstraint: boolean;
    orgUnitOwnershipConstraint: boolean;
    preAuthorisedConstraint: boolean;
    operations: Operation[];
    createBy?: string;
    createTime?: Date;
    editBy?: string;
    editTime?: Date;
}

export interface UserToken {
    id: string;
}

/**
 * This is the metadata model used by Opa policy
 * You only need this when you try to figure out user characteristic (unknown) via Known information of a dataset.
 * i.e. set `input.user` to unknown then calculate residual rules via partial evaluation.
 */
export interface DatasetAccessControlMetaData {
    /**
     * We do allow "archived" as defined in `publishing.schema.json`
     * But we probably should avoid using it as there is no story behinds it.
     */
    publishingState: "draft" | "published" | "archived";
    accessControl?: {
        ownerId?: string;
        orgUnitOwnerId?: string;
        preAuthorisedPermissionIds?: string[];
    };
}
