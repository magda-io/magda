import { ComponentType } from "react";
import { User } from "reducers/userManagementReducer";

const PREFIX = "MagdaPluginComponent";

type HeaderComponent = ComponentType<{
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
}>;

export function getPluginHeader(): HeaderComponent | null {
    return window?.[`${PREFIX}Header`] ? window[`${PREFIX}Header`] : null;
}
