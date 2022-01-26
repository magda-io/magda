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

export interface PublicUser {
    id?: string;
    displayName: string;
    photoURL?: string;
    isAdmin: boolean;
    roles?: Role[];
    permissions?: Permission[];
    managingOrgUnitIds?: string[];
    orgUnitId?: string;
    orgUnit?: OrgUnit;
}

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

export interface User extends PublicUser {
    email: string;
    source: string;
    sourceId: string;
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
        orgUnitOwnerId?: string;
        preAuthorisedPermissionIds?: string[];
    };
}
