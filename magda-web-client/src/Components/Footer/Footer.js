/* eslint-disable no-undef */
import React from "react";
import { connect } from "react-redux";
import AUfooter, { AUfooterNav } from "../../pancake/react/footer";
import { Link } from "react-router-dom";
import { Small } from "../../UI/Responsive";
import { config } from "../../config";

import "./footer.css";

const externalLinkRegex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-/]))?/;

function FooterLink({ link }) {
    if (link[1].indexOf("mailto") === 0) {
        return <a href={link[1]}>{link[0]}</a>;
    } else if (link[1] === "feedback") {
        return (
            <a
                href="#feedback"
                onClick={() => {
                    zE(function() {
                        zE.activate();
                    });
                    return false;
                }}
            >
                {link[0]}
            </a>
        );
    } else if (
        externalLinkRegex.test(link[1]) ||
        link[1].substring(0, 1) === "/"
    ) {
        return (
            <a target="_blank" rel="noopener noreferrer" href={link[1]}>
                {link[0]}
            </a>
        );
    } else {
        return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
    }
}

function FooterNavs({ footerNavs }) {
    return footerNavs.map(item => (
        <AUfooterNav className="col-md-3 col-sm-6 col-xs-6" key={item.label}>
            <h3 className="au-display-lg">{item.label}</h3>

            <ul className="au-link-list">
                {item.links.map(link => (
                    <li key={link[1]}>
                        <FooterLink link={link} />
                    </li>
                ))}
            </ul>
        </AUfooterNav>
    ));
}

function Copyright({ href, logoSrc, logoClassName, logoAlt, htmlContent }) {
    return (
        <div className="copyright">
            <div
                className="copyright-text"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
            <a
                target="_blank"
                rel="noopener noreferrer"
                href={href}
                className="logo-link"
            >
                <img
                    src={config.contentApiURL + logoSrc}
                    className={"logo " + logoClassName}
                    alt={logoAlt}
                />
            </a>
        </div>
    );
}

function Footer({ footerMediumNavs, footerSmallNavs, footerCopyRightItems }) {
    return (
        <AUfooter dark className="au-body au-body--dark footer">
            <div className="container">
                <Small>
                    {matched => (
                        <FooterNavs
                            footerNavs={
                                matched ? footerSmallNavs : footerMediumNavs
                            }
                        />
                    )}
                </Small>
                {footerCopyRightItems.length ? (
                    <section className="footer-end col-md-3 col-sm-6 col-xs-6">
                        {footerCopyRightItems.map((item, idx) => (
                            <Copyright
                                key={idx}
                                href={item.href}
                                logoSrc={item.logoSrc}
                                logoClassName={item.logoClassName}
                                logoAlt={item.logoAlt}
                                htmlContent={item.htmlContent}
                            />
                        ))}
                    </section>
                ) : null}
            </div>
        </AUfooter>
    );
}

const mapStateToProps = state => {
    const footerMediumNavs = [];
    const footerSmallNavs = [];
    const footerCopyRightItems = [];
    if (state.content.isFetched) {
        state.content.content.forEach(item => {
            if (item.id.indexOf("footer/navigation/categories/medium/") === 0) {
                footerMediumNavs.push(item.content);
            } else if (
                item.id.indexOf("footer/navigation/categories/small/") === 0
            ) {
                footerSmallNavs.push(item.content);
            } else if (
                item.id.indexOf("footer/navigation/copyRightItems/") === 0
            ) {
                footerCopyRightItems.push(item.content);
            }
        });

        footerMediumNavs.sort((a, b) => a.order - b.order);
        footerSmallNavs.sort((a, b) => a.order - b.order);
        footerCopyRightItems.sort((a, b) => a.order - b.order);
    }
    return { footerMediumNavs, footerSmallNavs, footerCopyRightItems };
};

export default connect(mapStateToProps)(Footer);
