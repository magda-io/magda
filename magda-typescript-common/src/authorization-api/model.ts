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
