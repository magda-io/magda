// LLM access profiles (#3838). See
// docs/design/agent-workspace/llm-access-profiles.md, "Data model".

export interface AccessProfile {
    id: string;
    name: string;
    description: string | null;
    /** Exact public model aliases, or exactly `["*"]` (DATA-2, MODEL-2). */
    allowedModels: string[];
    enabled: boolean;
    /** Audience org unit (AUTH-5); `null` means no org unit. */
    orgUnitId: string | null;
    /** A "public" profile (AUTH-6). */
    constraintExemption: boolean;
    /** The profile's one managed invoke permission (AUTH-7). */
    usePermissionId: string;
    /** Per user and per model; `null` means unlimited (DATA-3). */
    allowedDailyTokens: number | null;
    allowedWeeklyTokens: number | null;
    allowedMonthlyTokens: number | null;
    revision: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

/** The fields a profile manager can set (LIFE-2). */
export interface ProfileFields {
    name: string;
    description: string | null;
    allowedModels: string[];
    enabled: boolean;
    orgUnitId: string | null;
    constraintExemption: boolean;
    allowedDailyTokens: number | null;
    allowedWeeklyTokens: number | null;
    allowedMonthlyTokens: number | null;
}
