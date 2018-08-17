import React from "react";
import { contents } from "../content/register";
import { config } from "../config";
import Breadcrumbs from "../UI/Breadcrumbs";
import { Medium } from "../UI/Responsive";
import ReactDocumentTitle from "react-document-title";
import { Redirect } from "react-router-dom";
import "./StaticPage.css";

export default function StaticPage(props) {
    const id = props.match.params.id;
    const content = contents.get(id);

    const breadcrumb = [
        <li>
            <span>{content.title}</span>
        </li>
    ];
    if (content) {
        return (
            <ReactDocumentTitle
                title={`${content.title ? content.title : id} | ${
                    config.appName
                }`}
            >
                <div className={`static-page-container container page-${id}`}>
                    <Medium>
                        <Breadcrumbs breadcrumbs={breadcrumb} />
                    </Medium>
                    <h1> {content.title && content.title} </h1>
                    <div
                        className="markdown-body"
                        dangerouslySetInnerHTML={{
                            __html: content.__content
                        }}
                    />
                </div>
            </ReactDocumentTitle>
        );
    }
    return <Redirect to={"/404"} />;
}
