import { ComponentType, FunctionComponent } from "react";
import { User } from "reducers/userManagementReducer";
import { config, ConfigType } from "./config";
import React from "react";

const PREFIX = "MagdaPluginComponent";

export type ExternalCompontType<PropsType> = ComponentType<
    PropsType & { config: ConfigType }
>;

export function getComponent<T>(name: string): FunctionComponent<T> | null {
    const fullComponentName = `${PREFIX}${name}`;
    const ExternalComponent: ExternalCompontType<T> = window?.[
        fullComponentName
    ]?.default
        ? window[fullComponentName].default
        : window?.[fullComponentName]
        ? window[fullComponentName]
        : null;

    if (!ExternalComponent) {
        return null;
    }

    const ExternalComponentWithConfig: FunctionComponent<T> = (props) =>
        React.createElement(ExternalComponent, { ...props, config });

    return ExternalComponentWithConfig;
}

export type HeaderNavItem = {
    default?: {
        href: string;
        label: string;
        rel?: string;
        target?: string;
    };
    auth?: {};
    order: number;
};

export type HeaderComponentProps = {
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
    headerNavItems: HeaderNavItem[];
};

export type HeaderCompontType = ComponentType<HeaderComponentProps>;
export type ExternalHeaderCompontType = ExternalCompontType<
    HeaderComponentProps
>;

export function getPluginHeader(): HeaderCompontType | null {
    return getComponent<HeaderComponentProps>("Header");
}

export type CopyRightItem = {
    href: string;
    htmlContent: string;
    logoSrc: string;
    order: number;
};

export type FooterNavLink = {
    href: string;
    label: string;
    order: number;
};

export type FooterNavLinkGroup = {
    label: string;
    links: FooterNavLink[];
    order: number;
};

type FooterComponentPropsType = {
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
    noTopMargin: boolean;
    footerMediumNavs: FooterNavLinkGroup[];
    footerSmallNavs: FooterNavLinkGroup[];
    footerCopyRightItems: CopyRightItem[];
};

export type FooterComponentType = ComponentType<FooterComponentPropsType>;
export type ExternalFooterCompontType = ExternalCompontType<
    FooterComponentPropsType
>;

export function getPluginFooter(): FooterComponentType | null {
    return getComponent<FooterComponentPropsType>("Footer");
}
