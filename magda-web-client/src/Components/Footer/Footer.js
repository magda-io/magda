/* eslint-disable no-undef */
import React from "react";

import AUfooter, { AUfooterNav } from "../../pancake/react/footer";
import { Link } from "react-router-dom";
import { Small } from "../../UI/Responsive";

import dtaLogo from "./dta-logo.png";
import d61logo from "./data61-logo.png";

import "./footer.css";

const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-/]))?/;

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
    } else if (!regex.test(link[1])) {
        return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
    } else {
        return (
            <a target="_blank" rel="noopener noreferrer" href={link[1]}>
                {link[0]}
            </a>
        );
    }
}

function FooterNavs({ footerNavs }) {
    return footerNavs.map(item => (
        <AUfooterNav className="col-md-3 col-sm-6 col-xs-6" key={item.category}>
            <h4 className="nav-title">{item.category}</h4>

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

function Copyright({ children, href, logoSrc, logoClassName, logoAlt }) {
    return (
        <div className="copyright">
            <div className="copyright-text">{children}</div>
            <a
                target="_blank"
                rel="noopener noreferrer"
                href={href}
                className="logo-link"
            >
                <img
                    src={logoSrc}
                    className={"logo " + logoClassName}
                    alt={logoAlt}
                />
            </a>
        </div>
    );
}

export default function Footer({ footerNavs }) {
    return (
        <AUfooter dark className="au-body au-body--dark footer">
            <div className="container">
                <Small>
                    {matched => (
                        <FooterNavs
                            footerNavs={
                                matched ? footerNavs.small : footerNavs.medium
                            }
                        />
                    )}
                </Small>
                <section className="footer-end col-md-3 col-sm-6 col-xs-6">
                    <Copyright
                        href="https://www.data61.csiro.au/"
                        logoSrc={d61logo}
                        logoClassName="data61-logo"
                        logoAlt="Data61 Logo"
                    >
                        Developed by{" "}
                    </Copyright>
                    <Copyright
                        href="https://dta.gov.au/"
                        logoSrc={dtaLogo}
                        logoClassName="dta-logo"
                        logoAlt="DTA Logo"
                    >
                        Operated with&nbsp;
                        <span role="img" aria-label="love">
                            ❤️
                        </span>{" "}
                        by{" "}
                    </Copyright>
                </section>
            </div>
        </AUfooter>
    );
}
