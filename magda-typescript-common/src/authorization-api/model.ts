declare global {
    namespace Express {
        /**
         * This defines magda session data type.
         * the default session data type is `UserToken` (i.e. only user id field is available and is a compulsory field)
         * But any auth plugin provider could choose to customise the session by adding more fields (e.g. `arcgis`).
         * We also make sure it allows extra fields here.
         */
        interface User extends UserToken {
            [key: string]: any;
        }
    }
}

export interface UserRecord {
    id: string;
    displayName: string;
    photoURL: string;
    isAdmin: boolean;
    orgUnitId: string;
    email: string;
    source: string;
    sourceId: string;
}

export type PublicUser = Partial<
    Pick<UserRecord, "id" | "photoURL" | "orgUnitId">
> &
    Omit<
        UserRecord,
        "id" | "photoURL" | "orgUnitId" | "email" | "source" | "sourceId"
    > & {
        roles?: Role[];
        permissions?: Permission[];
        managingOrgUnitIds?: string[];
        orgUnit?: OrgUnit;
    };

export type User = PublicUser &
    Pick<UserRecord, "email" | "source" | "sourceId">;

export type CreateUserData = Partial<
    Omit<UserRecord, "email" | "displayName" | "id">
> &
    Pick<UserRecord, "displayName" | "email">;

export type OrgUnitRelationshipType =
    | "ancestor"
    | "descendant"
    | "equal"
    | "unrelated";

export interface OrgUnit {
    id?: string;
    name?: string;
    description?: string;
    // only available when query the orgUnit relationship against a node with some APIs
    relationship?: OrgUnitRelationshipType;
    left?: number;
    right?: number;
    createBy?: string;
    createTime?: Date;
    editBy?: string;
    editTime?: Date;
}

export interface APIKeyRecord {
    id: string;
    user_id: string;
    created_timestamp: string;
    hash: string;
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
export interface AccessControlMetaData {
    accessControl?: {
        ownerId?: string;
        orgUnitId?: string;
        preAuthorisedPermissionIds?: string[];
    };
}
