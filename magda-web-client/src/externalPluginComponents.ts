import { ComponentType } from "react";
import { User } from "reducers/userManagementReducer";

const PREFIX = "MagdaPluginComponent";

type HeaderComponent = ComponentType<{
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
}>;

export function getComponent<T>(name: string): T | null {
    const fullComponentName = `${PREFIX}${name}`;
    return window?.[fullComponentName]?.default
        ? window[fullComponentName].default
        : window?.[fullComponentName]
        ? window[fullComponentName]
        : null;
}

export function getPluginHeader(): HeaderComponent | null {
    return getComponent("Header");
}
