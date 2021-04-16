import { ComponentType } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { Location, History } from "history";
import { User } from "reducers/userManagementReducer";
import { requestSignOut, requestWhoAmI } from "./actions/userManagementActions";
import { fetchContent } from "./actions/contentActions";
import { config, ConfigType } from "./config";

const PREFIX = "MagdaPluginComponent";

interface CommonPropsType {
    isFetchingWhoAmI: boolean;
    user: User;
    whoAmIError: Error | null;
    config: ConfigType;
    history: History;
    location: Location;
    match: any;
    requestSignOut: () => Promise<void>;
    requestWhoAmI: () => Promise<void>;
    fetchContent: () => Promise<void>;
}

export type ExternalCompontType<T> = ComponentType<T & CommonPropsType>;

const mapStateToProps = (state) => {
    const { userManagement, isFetchingWhoAmI, whoAmIError } = state;

    return {
        user: userManagement.user,
        isFetchingWhoAmI,
        whoAmIError,
        config
    };
};

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            requestSignOut,
            requestWhoAmI,
            fetchContent
        },
        dispatch
    );
};

export function getComponent<T>(name: string): ComponentType<T> | null {
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

    return withRouter(
        connect(mapStateToProps, mapDispatchToProps)(ExternalComponent as any)
    );
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
