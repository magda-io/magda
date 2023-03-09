export interface AccessControlAspect {
    ownerId?: string;
    orgUnitId?: string;
    preAuthorisedPermissionIds?: string[];
}

export interface JsonPatch {
    op: "replace" | "add" | "remove";
    path: string;
    value?: any;
}
