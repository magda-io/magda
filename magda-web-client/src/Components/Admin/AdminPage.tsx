import React, { Component } from "react";
import AdminHeader from "./AdminHeader";

import { config } from "../../config";

// E.g. basePath = "/magda/" or "/"
const basePath = config.serverBasePath;

export default class AdminPage extends Component {
    render() {
        return (
            <div>
                <AdminHeader />
                <ul>
                    <li>
                        <a href={basePath + "admin/home"}>Home</a>
                    </li>
                    <li>
                        <a href={basePath + "admin/home-stories"}>
                            Home Stories
                        </a>
                    </li>
                    <li>
                        <a href={basePath + "admin/home-highlights"}>
                            Home Highlights
                        </a>
                    </li>

                    <li>
                        <a href={basePath + "admin/header-navigation"}>
                            Header Navigation
                        </a>
                    </li>
                    <li>
                        <a href={basePath + "admin/footer-navigation/medium"}>
                            Footer Navigation
                        </a>
                    </li>
                    <li>
                        <a href={basePath + "admin/footer-copyright"}>
                            Footer Copyright
                        </a>
                    </li>
                    <li>
                        <a href={basePath + "admin/accounts"}>User Accounts</a>
                    </li>
                    <li>
                        <a href={basePath + "admin/i18n"}>Language</a>
                    </li>
                    <li>
                        <a href={basePath + "admin/connectors"}>Connectors</a>
                    </li>
                    <li>
                        <a href={basePath + "admin/pages"}>Content Pages</a>
                    </li>
                </ul>
            </div>
        );
    }
}
