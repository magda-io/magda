import { AccessControlAspect } from "../registry/model.js";
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

export interface OrgUnitRecord {
    id: string;
    name: string;
    description: string;
    left: number;
    right: number;
    createBy: string;
    createTime: Date;
    editBy: string;
    editTime: Date;
}

export type OrgUnit = Partial<OrgUnitRecord> & {
    // only available when query the orgUnit relationship against a node with some APIs
    relationship?: OrgUnitRelationshipType;
};

export interface APIKeyRecord {
    id: string;
    user_id: string;
    created_timestamp: Date;
    hash: string;
    enabled: boolean;
    expiry_time?: Date;
    last_successful_attempt_time?: Date;
    last_failed_attempt_time?: Date;
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
    allowExemption: boolean;
}

export interface PermissionRecord {
    id: string;
    name: string;
    description: string;
    resource_id: string;
    user_ownership_constraint: boolean;
    org_unit_ownership_constraint: boolean;
    pre_authorised_constraint: boolean;
    owner_id: string;
    create_time: string;
    create_by: string;
    edit_time: string;
    edit_by: string;
    allow_exemption: boolean;
}

export interface CreateRolePermissionInputData
    extends Omit<
        PermissionRecord,
        | "id"
        | "owner_id"
        | "create_by"
        | "create_time"
        | "edit_by"
        | "edit_time"
        | "allow_exemption"
        | "resource_id"
    > {
    operationIds?: string[];
    operationUris?: string[];
    resource_id?: string;
    resourceUri?: string;
    allow_exemption?: boolean;
}

export interface UpdateRolePermissionInputData
    extends Partial<CreateRolePermissionInputData> {}

export type OperationRecord = {
    id: string;
    uri: string;
    name: string;
    description: string;
    resource_id: string;
};

export type ResourceRecord = {
    id: string;
    uri: string;
    name: string;
    description: string;
};

export interface UserToken {
    id: string;
}

/**
 * This is the metadata model used by Opa policy
 * You only need this when you try to figure out user characteristic (unknown) via Known information of a dataset.
 * i.e. set `input.user` to unknown then calculate residual rules via partial evaluation.
 */
export interface AccessControlMetaData {
    accessControl?: AccessControlAspect;
}

export interface CreateAccessGroupRequestBodyType {
    name: string;
    resourceUri: string;
    description?: string;
    keywords?: string[];
    operationUris: string[];
    ownerId?: string;
    orgUnitId?: string;
}

export interface UpdateAccessGroupRequestBodyType {
    name?: string;
    description?: string;
    keywords?: string[];
    operationUris?: string[];
    ownerId?: string;
    orgUnitId?: string;
}

export interface AccessGroup {
    id: string;
    name: string;
    resourceUri: string;
    operationUris: string[];
    description?: string;
    keywords?: string[];
    permissionId: string;
    roleId: string;
    ownerId?: string;
    orgUnit?: string;
    createTime?: Date;
    createBy?: string;
    editTime?: Date;
    editBy?: string;
}
