import React, { FunctionComponent, useMemo, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Button from "rsuite/Button";
import Input from "rsuite/Input";
import Message from "rsuite/Message";
import Radio from "rsuite/Radio";
import RadioGroup from "rsuite/RadioGroup";
import TagPicker from "rsuite/TagPicker";
import Toggle from "rsuite/Toggle";
import { MdDeleteForever } from "react-icons/md";
import ConfirmDialog from "./ConfirmDialog";
import AccessProfileOrgUnitPicker from "./AccessProfileOrgUnitPicker";
import { ALL_MODELS_LABEL } from "./AccessProfilesPage";
import {
    AccessProfile,
    AccessProfileFields,
    ALL_MODELS,
    createAccessProfile,
    deleteAccessProfile,
    describeLlmServicesError,
    getAvailableModels,
    isStaleRevisionError,
    updateAccessProfile
} from "api-clients/LlmServicesApis";

export const ORG_UNIT_HELP =
    "Users in this org unit, or in any org unit below it, can use this profile if they hold an org-unit-scoped Use permission (included in the Agent Workspace Users role). Users in units above it don't get access.";
export const ORG_UNIT_EXAMPLE =
    "Example: a profile on Finance is available to people in Finance and Finance › Payroll, but not to people in Corporate, the unit above Finance.";
export const PUBLIC_HELP =
    "Available to every user whose role grants public LLM access (exemption). The administrator decides which roles that is.";
export const LIMITS_HELP =
    "Per user and per model. Blank means no limit; 0 blocks new requests.";
export const ALL_MODELS_HELP =
    "New models the operator adds become available under *.";
export const STALE_MESSAGE =
    "This profile was changed by someone else. Reload to see the changes.";

type ModelMode = "all" | "selected";

type LimitKey =
    | "allowedDailyTokens"
    | "allowedWeeklyTokens"
    | "allowedMonthlyTokens";

const LIMITS: Array<{ key: LimitKey; label: string }> = [
    { key: "allowedDailyTokens", label: "Daily limit (tokens)" },
    { key: "allowedWeeklyTokens", label: "Weekly limit (tokens)" },
    { key: "allowedMonthlyTokens", label: "Monthly limit (tokens)" }
];

export type FormState = {
    name: string;
    description: string;
    modelMode: ModelMode;
    models: string[];
    enabled: boolean;
    orgUnitId: string | null;
    constraintExemption: boolean;
} & Record<LimitKey, string>;

export function toFormState(profile?: AccessProfile): FormState {
    const isAll =
        !profile ||
        (profile.allowedModels.length === 1 &&
            profile.allowedModels[0] === ALL_MODELS);
    const limit = (value?: number | null) =>
        value === null || value === undefined ? "" : value.toLocaleString("en");
    return {
        name: profile?.name || "",
        description: profile?.description || "",
        modelMode: isAll ? "all" : "selected",
        models: isAll ? [] : [...(profile?.allowedModels || [])],
        enabled: profile ? profile.enabled : true,
        orgUnitId: profile?.orgUnitId || null,
        constraintExemption: profile ? profile.constraintExemption : false,
        allowedDailyTokens: limit(profile?.allowedDailyTokens),
        allowedWeeklyTokens: limit(profile?.allowedWeeklyTokens),
        allowedMonthlyTokens: limit(profile?.allowedMonthlyTokens)
    };
}

export type FormErrors = Partial<Record<keyof FormState, string>>;

/**
 * A limit's digits: plain (`32343232`) or grouped in threes with commas
 * (`32,343,232`). Anything else, e.g. `1,5`, a lone comma or a misplaced
 * separator, is `undefined`: invalid, never silently changed. Blank is `""`.
 */
function limitDigits(value: string): string | undefined {
    const text = value.trim();
    if (/^\d*$/.test(text)) {
        return text;
    }
    return /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : undefined;
}

/** A limit for editing: plain digits, or the text as typed if invalid. */
export function unformatLimit(value: string): string {
    return limitDigits(value) ?? value;
}

/**
 * A limit with digit groups (`32,343,232`), for reading big numbers. Text
 * that isn't a valid limit is left as typed, so its error stays visible.
 */
export function formatLimit(value: string): string {
    const digits = limitDigits(value);
    return digits && Number.isSafeInteger(Number(digits))
        ? Number(digits).toLocaleString("en")
        : value;
}

/** Only a blank field is unlimited (`null`); `undefined` is invalid. */
function parseLimit(value: string): number | null | undefined {
    const digits = limitDigits(value);
    if (digits === undefined) {
        return undefined;
    }
    if (!digits) {
        return null;
    }
    const number = Number(digits);
    return Number.isSafeInteger(number) ? number : undefined;
}

/** Client-side checks; the server validates everything again. */
export function validateForm(
    form: FormState
): { fields?: AccessProfileFields; errors: FormErrors } {
    const errors: FormErrors = {};
    const name = form.name.trim();
    if (!name) {
        errors.name = "Enter a name.";
    } else if (name.length > 200) {
        errors.name = "Use at most 200 characters.";
    }
    if (form.description.length > 2000) {
        errors.description = "Use at most 2,000 characters.";
    }
    if (form.modelMode === "selected" && !form.models.length) {
        errors.models =
            "Select at least one model, or choose all available models.";
    }
    const limits = {} as Record<LimitKey, number | null>;
    for (const { key } of LIMITS) {
        const value = parseLimit(form[key]);
        if (value === undefined) {
            errors[key] = "Enter a whole number of tokens, or leave it blank.";
        } else {
            limits[key] = value;
        }
    }
    if (Object.keys(errors).length) {
        return { errors };
    }
    return {
        errors,
        fields: {
            name,
            description: form.description.trim() ? form.description : null,
            allowedModels:
                form.modelMode === "all" ? [ALL_MODELS] : [...form.models],
            enabled: form.enabled,
            orgUnitId: form.orgUnitId,
            constraintExemption: form.constraintExemption,
            ...limits
        }
    };
}

export const deleteConfirmMessage = (name: string) =>
    `Delete profile "${name}"? Users will lose the access this profile gives, and it will be removed from every role that holds it. Their usage history is kept.`;

type PropsType = {
    /** `undefined` to create a profile. */
    profile?: AccessProfile;
    canEdit: boolean;
    canDelete: boolean;
    onSaved: (profile: AccessProfile, created: boolean) => void;
    onDeleted: (profile: AccessProfile) => void;
    /** Discard the form and load the latest profile. */
    onReload: () => void;
    onCancel?: () => void;
};

const AccessProfileGeneralForm: FunctionComponent<PropsType> = (props) => {
    const { profile, canEdit, canDelete } = props;
    const isCreate = !profile;
    const [form, setForm] = useState<FormState>(() => toFormState(profile));
    const [errors, setErrors] = useState<FormErrors>({});
    const [isStale, setIsStale] = useState<boolean>(false);
    const [saveError, setSaveError] = useState<string>("");

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
        setForm((current) => ({ ...current, [key]: value }));
    const reformat = (key: LimitKey, format: (value: string) => string) =>
        setForm((current) => ({ ...current, [key]: format(current[key]) }));

    const availableModels = useAsync(async () => getAvailableModels(), []);

    const modelOptions = useMemo(() => {
        const available = availableModels.result?.items || [];
        const options = available.map((alias) => ({
            label: alias,
            value: alias
        }));
        // aliases a profile already names stay visible, so they can be removed
        form.models
            .filter((alias) => available.indexOf(alias) === -1)
            .forEach((alias) =>
                options.push({
                    label: `${alias} (not currently available)`,
                    value: alias
                })
            );
        return options;
    }, [availableModels.result, form.models]);

    const save = useAsyncCallback(async () => {
        setSaveError("");
        const { fields, errors } = validateForm(form);
        setErrors(errors);
        if (!fields) {
            return;
        }
        try {
            const saved = profile
                ? await updateAccessProfile(
                      profile.id,
                      profile.revision,
                      fields
                  )
                : await createAccessProfile(fields);
            props.onSaved(saved, !profile);
        } catch (e) {
            if (isStaleRevisionError(e)) {
                // DATA-4: keep the unsaved form contents
                setIsStale(true);
            } else {
                setSaveError(describeLlmServicesError(e));
            }
        }
    });

    const confirmDelete = () => {
        if (!profile) {
            return;
        }
        ConfirmDialog.open({
            headingText: "Delete profile?",
            confirmMsg: deleteConfirmMessage(profile.name),
            loadingText: "Deleting the profile...",
            confirmHandler: async () => {
                try {
                    await deleteAccessProfile(profile.id);
                } catch (e) {
                    // the dialog stays open, so the delete can be retried; the
                    // description says when retrying helps
                    throw new Error(
                        `Failed to delete the access profile: ${describeLlmServicesError(
                            e
                        )}`
                    );
                }
                props.onDeleted(profile);
            }
        });
    };

    const fieldError = (key: keyof FormState) =>
        errors[key] ? (
            <div
                className="access-profile-field-error"
                id={`access-profile-${key}-error`}
            >
                {errors[key]}
            </div>
        ) : null;

    const describedBy = (key: keyof FormState, helpId?: string) =>
        [errors[key] ? `access-profile-${key}-error` : "", helpId || ""]
            .filter(Boolean)
            .join(" ") || undefined;

    const disabled = !canEdit || save.loading;

    return (
        <form
            className="access-profile-form"
            noValidate
            onSubmit={(event) => {
                event.preventDefault();
                if (canEdit) {
                    save.execute();
                }
            }}
        >
            {isStale ? (
                <Message showIcon type="warning" role="alert">
                    <p>{STALE_MESSAGE}</p>
                    <p>
                        Your unsaved changes are still in the form. Reloading
                        discards them.
                    </p>
                    <Button appearance="primary" onClick={props.onReload}>
                        Reload
                    </Button>
                </Message>
            ) : null}
            {saveError ? (
                <Message
                    showIcon
                    type="error"
                    role="alert"
                    header="The profile wasn't saved"
                >
                    {saveError}
                </Message>
            ) : null}

            <div className="access-profile-field">
                <label
                    className="access-profile-field-label"
                    htmlFor="access-profile-name"
                >
                    Name (required)
                </label>
                <Input
                    id="access-profile-name"
                    value={form.name}
                    disabled={disabled}
                    aria-invalid={!!errors.name}
                    aria-describedby={describedBy("name")}
                    onChange={(value) => update("name", value)}
                />
                {fieldError("name")}
            </div>

            <div className="access-profile-field">
                <label
                    className="access-profile-field-label"
                    htmlFor="access-profile-description"
                >
                    Description
                </label>
                <Input
                    id="access-profile-description"
                    as="textarea"
                    rows={3}
                    value={form.description}
                    disabled={disabled}
                    aria-invalid={!!errors.description}
                    aria-describedby={describedBy("description")}
                    onChange={(value) => update("description", value)}
                />
                {fieldError("description")}
            </div>

            <fieldset>
                <legend>Models</legend>
                <RadioGroup
                    name="access-profile-model-mode"
                    value={form.modelMode}
                    onChange={(value) =>
                        update("modelMode", value as ModelMode)
                    }
                >
                    <Radio value="all" disabled={disabled}>
                        {ALL_MODELS_LABEL}
                    </Radio>
                    <Radio value="selected" disabled={disabled}>
                        Only the models selected below
                    </Radio>
                </RadioGroup>
                <p className="access-profile-help" id="access-profile-all-help">
                    {ALL_MODELS_HELP}
                </p>
                {form.modelMode === "selected" ? (
                    <div className="access-profile-models-picker">
                        <label
                            className="sr-only"
                            htmlFor="access-profile-models"
                        >
                            Selected models
                        </label>
                        <TagPicker
                            id="access-profile-models"
                            aria-label="Selected models"
                            data={modelOptions}
                            value={form.models}
                            block={true}
                            disabled={disabled}
                            loading={availableModels.loading}
                            placeholder="Select models..."
                            onChange={(value) =>
                                update("models", (value || []) as string[])
                            }
                        />
                        {availableModels.error ? (
                            <p
                                className="access-profile-field-error"
                                role="alert"
                            >
                                Unable to load the available models.{" "}
                                {describeLlmServicesError(
                                    availableModels.error
                                )}{" "}
                                <Button
                                    appearance="link"
                                    onClick={() => availableModels.execute()}
                                >
                                    Retry
                                </Button>
                            </p>
                        ) : availableModels.result &&
                          !availableModels.result.servedListAvailable ? (
                            <p className="access-profile-help">
                                The list of models LiteLLM serves couldn't be
                                read, so this shows every model the deployment
                                allows. Some may not be served.
                            </p>
                        ) : null}
                        {fieldError("models")}
                    </div>
                ) : null}
            </fieldset>

            <div className="access-profile-field">
                <Toggle
                    checked={form.enabled}
                    disabled={disabled}
                    onChange={(checked) => update("enabled", checked)}
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                    label="Enabled"
                />
                <p className="access-profile-help">
                    A disabled profile gives no access, but keeps its settings
                    and roles.
                </p>
            </div>

            <div className="access-profile-field">
                <label
                    className="access-profile-field-label"
                    htmlFor="access-profile-org-unit"
                >
                    Org unit (audience)
                </label>
                <AccessProfileOrgUnitPicker
                    id="access-profile-org-unit"
                    value={form.orgUnitId}
                    disabled={disabled}
                    onChange={(value) => update("orgUnitId", value)}
                />
                <p
                    className="access-profile-help"
                    id="access-profile-org-unit-help"
                >
                    {ORG_UNIT_HELP}
                </p>
                <p className="access-profile-help">{ORG_UNIT_EXAMPLE}</p>
                <p className="access-profile-help">
                    With No org unit, the profile gives no access through org
                    units.
                </p>
            </div>

            <div className="access-profile-field">
                <Toggle
                    checked={form.constraintExemption}
                    disabled={disabled}
                    onChange={(checked) =>
                        update("constraintExemption", checked)
                    }
                    checkedChildren="Yes"
                    unCheckedChildren="No"
                    label="Public"
                />
                <p className="access-profile-help">{PUBLIC_HELP}</p>
            </div>

            <fieldset>
                <legend>Token limits</legend>
                <p
                    className="access-profile-help"
                    id="access-profile-limits-help"
                >
                    {LIMITS_HELP}
                </p>
                <div className="access-profile-limits">
                    {LIMITS.map(({ key, label }) => (
                        <div className="access-profile-field" key={key}>
                            <label htmlFor={`access-profile-${key}`}>
                                {label}
                            </label>
                            <Input
                                id={`access-profile-${key}`}
                                inputMode="numeric"
                                placeholder="No limit"
                                value={form[key]}
                                disabled={disabled}
                                aria-invalid={!!errors[key]}
                                aria-describedby={describedBy(
                                    key,
                                    "access-profile-limits-help"
                                )}
                                onChange={(value) => update(key, value)}
                                // grouped digits are easier to read; plain
                                // digits are easier to edit
                                onFocus={() => reformat(key, unformatLimit)}
                                onBlur={() => reformat(key, formatLimit)}
                            />
                            {fieldError(key)}
                        </div>
                    ))}
                </div>
            </fieldset>

            <div className="access-profile-form-actions">
                {canEdit ? (
                    <Button
                        type="submit"
                        appearance="primary"
                        loading={save.loading}
                        disabled={save.loading}
                    >
                        {isCreate ? "Create profile" : "Save changes"}
                    </Button>
                ) : null}
                {props.onCancel ? (
                    <Button onClick={props.onCancel} disabled={save.loading}>
                        Cancel
                    </Button>
                ) : null}
                {profile && canDelete ? (
                    <Button
                        className="access-profile-delete"
                        color="red"
                        appearance="ghost"
                        startIcon={<MdDeleteForever />}
                        disabled={save.loading}
                        onClick={confirmDelete}
                    >
                        Delete profile
                    </Button>
                ) : null}
            </div>
            {!canEdit && profile ? (
                <p className="access-profile-help">
                    You can view this profile but not change it.
                </p>
            ) : null}

            {profile ? (
                <div className="access-profile-metadata">
                    Revision {profile.revision}. Created{" "}
                    {new Date(profile.createdAt).toLocaleString()}; last updated{" "}
                    {new Date(profile.updatedAt).toLocaleString()}.
                </div>
            ) : null}
        </form>
    );
};

export default AccessProfileGeneralForm;
