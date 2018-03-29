import ReactDocumentTitle from "react-document-title";
import React from "react";
import { config } from "./config.js";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import Banner from "./UI/Banner";
import FeedbackForm from "./Components/FeedbackForm";

import { requestWhoAmI } from "./actions/userManagementActions";
import Container from "muicss/lib/react/container";
import d61logo from "./data61-logo.png";
import Notification from "./UI/Notification";
import { hideTopNotification } from "./actions/topNotificationAction";

import HomePage from "./Pages/HomePage";
import OtherPages from "./Pages/OtherPages";

import { Route, Link, Switch } from "react-router-dom";
import { Medium } from "./UI/Responsive";

import "./AppContainer.css";

const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-/]))?/;

class AppContainer extends React.Component {
    componentWillMount() {
        this.props.requestWhoAmI();
    }
    renderLink(link) {
        if (link[1].indexOf("mailto") === 0) {
            return <a href={link[1]}>{link[0]}</a>;
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

    render() {
        const footerNavs = config.footerNavigation;
        return (
            <ReactDocumentTitle title={config.appName}>
                <div>
                    <Medium>
                        <Banner />
                    </Medium>
                    <FeedbackForm />
                    <Switch>
                        <Route exact path="/" component={HomePage} />
                        <Route path="/*" component={OtherPages} />
                    </Switch>

                    <footer className="footer clearfix">
                        <Container>
                            <ul className="mui-list--unstyled">
                                {footerNavs.map(item => (
                                    <li
                                        key={item.category}
                                        className="mui-col-md-2 mui-col-sm-3"
                                    >
                                        <span className="nav-title">
                                            {item.category}
                                        </span>
                                        <ul className="mui-list--unstyled">
                                            {item.links.map(link => (
                                                <li key={link[1]}>
                                                    {this.renderLink(link)}
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                            <div className="copyright">
                                {" "}
                                Developed by{" "}
                                <a
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    href="https://www.data61.csiro.au/"
                                >
                                    <img src={d61logo} alt="data61-logo" />
                                </a>
                            </div>
                        </Container>
                    </footer>
                    {this.props.topNotification.visible ? (
                        <Notification
                            content={{
                                title: this.props.topNotification.title,
                                detail: this.props.topNotification.message
                            }}
                            type={this.props.topNotification.type}
                            onDismiss={() => {
                                this.props.hideTopNotification();
                                if (
                                    !this.props.topNotification.onDismiss ||
                                    typeof this.props.topNotification
                                        .onDismiss !== "function"
                                )
                                    return;
                                this.props.topNotification.onDismiss();
                            }}
                        />
                    ) : null}
                </div>
            </ReactDocumentTitle>
        );
    }
}

const mapStateToProps = state => {
    return {
        topNotification: state.topNotification
    };
};

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            requestWhoAmI: requestWhoAmI,
            hideTopNotification
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(AppContainer);
