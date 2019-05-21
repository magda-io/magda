import React, { Component } from "react";
import AdminHeader from "./AdminHeader";

export default class AdminPage extends Component {
    render() {
        return (
            <div>
                <AdminHeader />
                <ul>
                    <li>
                        <a href="/admin/home">Home</a>
                    </li>
                    <li>
                        <a href="/admin/home-stories">Home Stories</a>
                    </li>
                    <li>
                        <a href="/admin/home-highlights">Home Highlights</a>
                    </li>

                    <li>
                        <a href="/admin/header-navigation">Header Navigation</a>
                    </li>
                    <li>
                        <a href="/admin/footer-navigation/medium">
                            Footer Navigation
                        </a>
                    </li>
                    <li>
                        <a href="/admin/footer-copyright">Footer Copyright</a>
                    </li>
                    <li>
                        <a href="/admin/accounts">User Accounts</a>
                    </li>
                    <li>
                        <a href="/admin/i18n">Language</a>
                    </li>
                    <li>
                        <a href="/admin/connectors">Connectors</a>
                    </li>
                    <li>
                        <a href="/admin/pages">Content Pages</a>
                    </li>
                </ul>
            </div>
        );
    }
}
