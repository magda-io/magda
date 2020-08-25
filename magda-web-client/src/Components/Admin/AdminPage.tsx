import React, { Component } from "react";
import AdminHeader from "./AdminHeader";
import CommonLink from "Components/Common/CommonLink";

export default class AdminPage extends Component {
    render() {
        return (
            <div>
                <AdminHeader />
                <ul>
                    <li>
                        <CommonLink href="/admin/home">Home</CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/home-stories">
                            Home Stories
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/home-highlights">
                            Home Highlights
                        </CommonLink>
                    </li>

                    <li>
                        <CommonLink href="/admin/header-navigation">
                            Header Navigation
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/footer-navigation/medium">
                            Footer Navigation
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/footer-copyright">
                            Footer Copyright
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/accounts">
                            User Accounts
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/i18n">Language</CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/connectors">
                            Connectors
                        </CommonLink>
                    </li>
                    <li>
                        <CommonLink href="/admin/pages">
                            Content Pages
                        </CommonLink>
                    </li>
                </ul>
            </div>
        );
    }
}
