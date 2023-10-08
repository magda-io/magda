export interface AccessControlAspect {
    ownerId?: string;
    orgUnitId?: string;
    preAuthorisedPermissionIds?: string[];
    constraintExemption?: boolean;
}

export interface JsonPatch {
    op: "replace" | "add" | "remove";
    path: string;
    value?: any;
}
