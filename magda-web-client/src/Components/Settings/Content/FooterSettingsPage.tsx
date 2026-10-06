import React, { FunctionComponent } from "react";
import { Redirect, useHistory, useLocation, useParams } from "react-router-dom";
import Nav from "rsuite/Nav";
import Panel from "rsuite/Panel";
import { MdComputer, MdCopyright, MdSmartphone } from "react-icons/md";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import ContentSettingsLayout from "./ContentSettingsLayout";
import FooterCategoriesGrid from "./FooterCategoriesGrid";
import FooterCopyrightGrid from "./FooterCopyrightGrid";
import {
    FooterSize,
    footerSizeLabel,
    FOOTER_SETTINGS_BASE_URL,
    isFooterSize
} from "./footerUtils";

const COPYRIGHT_TAB = "copyright";

const FooterSettingsPage: FunctionComponent = () => {
    const { tab } = useParams<{ tab: string }>();
    const history = useHistory();
    const location = useLocation();

    if (tab !== COPYRIGHT_TAB && !isFooterSize(tab)) {
        return <Redirect to={`${FOOTER_SETTINGS_BASE_URL}/medium`} />;
    }

    const tabTitle =
        tab === COPYRIGHT_TAB
            ? "Copyright"
            : `${footerSizeLabel(tab as FooterSize)} menu`;

    return (
        <ContentSettingsLayout
            className="footer-settings-page"
            breadcrumbs={[
                { to: `${FOOTER_SETTINGS_BASE_URL}/medium`, title: "Footer" },
                { title: tabTitle }
            ]}
        >
            <p className="page-intro">
                The site footer shows menu categories with links (the desktop
                and mobile footers are configured separately), followed by
                copyright items.
            </p>
            <Nav
                className="content-settings-tab"
                appearance="tabs"
                activeKey={tab}
                onSelect={(key) =>
                    history.push(
                        getUrlWithPopUpQueryString(
                            `${FOOTER_SETTINGS_BASE_URL}/${key}`,
                            location
                        )
                    )
                }
            >
                <Nav.Item eventKey="medium" icon={<MdComputer />}>
                    Desktop menu
                </Nav.Item>
                <Nav.Item eventKey="small" icon={<MdSmartphone />}>
                    Mobile menu
                </Nav.Item>
                <Nav.Item eventKey={COPYRIGHT_TAB} icon={<MdCopyright />}>
                    Copyright
                </Nav.Item>
            </Nav>
            <Panel bordered>
                {tab === COPYRIGHT_TAB ? (
                    <FooterCopyrightGrid />
                ) : (
                    <FooterCategoriesGrid key={tab} size={tab as FooterSize} />
                )}
            </Panel>
        </ContentSettingsLayout>
    );
};

export default FooterSettingsPage;
