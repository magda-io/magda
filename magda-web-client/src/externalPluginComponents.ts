import { ComponentType } from "react";
import { User } from "reducers/userManagementReducer";

const PREFIX = "MagdaPluginComponent";

export function getComponent<T>(name: string): T | null {
    const fullComponentName = `${PREFIX}${name}`;
    return window?.[fullComponentName]?.default
        ? window[fullComponentName].default
        : window?.[fullComponentName]
        ? window[fullComponentName]
        : null;
}

type HeaderNavItem = {
    default?: {
        href: string;
        label: string;
        rel?: string;
        target?: string;
    };
    auth?: {};
    order: number;
};

export type HeaderComponent = ComponentType<{
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
    headerNavItems: HeaderNavItem[];
}>;

export function getPluginHeader(): HeaderComponent | null {
    return getComponent<HeaderComponent>("Header");
}

type CopyRightItem = {
    href: string;
    htmlContent: string;
    logoSrc: string;
    order: number;
};

type FooterNavLink = {
    href: string;
    label: string;
    order: number;
};

type FooterNavLinkGroup = {
    label: string;
    links: FooterNavLink[];
    order: number;
};

export type FooterComponent = ComponentType<{
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
    noTopMargin: boolean;
    footerMediumNavs: FooterNavLinkGroup[];
    footerSmallNavs: FooterNavLinkGroup[];
    footerCopyRightItems: CopyRightItem[];
}>;

export function getPluginFooter(): FooterComponent | null {
    return getComponent<FooterComponent>("Footer");
}
