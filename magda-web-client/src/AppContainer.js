import ReactDocumentTitle from "react-document-title";
import React from "react";
import { config } from "./config.js";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import SearchBox from "./Components/Search/SearchBox";
import HeaderHome from "./Components/Header/HeaderHome";
import HeaderHomeMobile from "./Components/Header/HeaderHomeMobile";
import HeaderOthers from "./Components/Header/HeaderOthers";
import HeaderOthersMobile from "./Components/Header/HeaderOthersMobile";
import ProjectsViewer from "./Components/Project/ProjectsViewer";
import ProjectDetails from "./Components/Project/ProjectDetails";
import CreateProject from "./Components/Project/CreateProject";
import PublishersViewer from "./Components/Publisher/PublishersViewer";
import PublisherDetails from "./Components/Publisher/PublisherDetails";
import Banner from "./UI/Banner";
import FeedbackForm from "./Components/FeedbackForm";
import Home from "./Components/Home";
import RouteNotFound from "./Components/RouteNotFound";
import Search from "./Components/Search/Search";
import RecordHandler from "./Components/RecordHandler";
import { staticPageRegister } from "./content/register";
import Feedback from "./Components/Feedback";
import Contact from "./Components/Contact";
import Account from "./Components/Account/Account";
import Login from "./Components/Account/Login";
import SignInRedirect from "./Components/Account/SignInRedirect";
import { requestWhoAmI } from "./actions/userManagementActions";
import Container from "muicss/lib/react/container";
import d61logo from "./data61-logo.png";
import Notification from "./UI/Notification";
import { hideTopNotification } from "./actions/topNotificationAction";
import { Medium, Small } from "./UI/Responsive";

import { Route, Link, Switch } from "react-router-dom";

import "./AppContainer.css";

class AppContainer extends React.Component {

    componentWillMount() {
        this.props.requestWhoAmI();
    }
    renderLink(link) {
        const regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-/]))?/;
        if (!regex.test(link[1])) {
            return <Link to={`/${encodeURI(link[1])}`}>{link[0]}</Link>;
        }
        return (
            <a target="_blank" rel="noopener noreferrer" href={link[1]}>
                {link[0]}
            </a>
        );
    }

    renderBody() {
        return (
            <Switch>
                <Route exact path="/" component={Home} />
                <Route exact path="/search" component={Search} />
                <Route exact path="/feedback" component={Feedback} />
                <Route exact path="/contact" component={Contact} />
                <Route exact path="/account" component={Account} />
                <Route exact path="/login" component={Login} />
                <Route
                    exact
                    path="/sign-in-redirect"
                    component={SignInRedirect}
                />
                <Route
                    path="/dataset/:datasetId/distribution/:distributionId"
                    component={RecordHandler}
                />
                <Route path="/dataset/:datasetId" component={RecordHandler} />
                <Route exact path="/projects" component={ProjectsViewer} />
                <Route exact path="/projects/new" component={CreateProject} />
                <Route path="/projects/:projectId" component={ProjectDetails} />
                <Route exact path="/publishers" component={PublishersViewer} />
                <Route
                    path="/publishers/:publisherId"
                    component={PublisherDetails}
                />
                {staticPageRegister.map(item => (
                    <Route
                        path={`/page/:id`}
                        key={item.path}
                        component={item.component}
                    />
                ))}
                <Route exact path="/404" component={RouteNotFound} />
                <Route path="/*" component={RouteNotFound} />
            </Switch>
        );
    }

    render() {
        const footerNavs = config.footerNavigation;
        return (
            <ReactDocumentTitle title={config.appName}>
                <div>
                    <Banner />
                    <FeedbackForm />
                    <Container className="app-container">
                        <Small>
                            <Switch>
                                <Route exact path="/" component={HeaderHomeMobile} />
                                <Route path="/*" component={HeaderOthersMobile} />
                            </Switch>
                        </Small>
                        <Medium>
                            <Switch>
                                <Route exact path="/" component={HeaderHome} />
                                <Route path="/*" component={HeaderOthers} />
                            </Switch>
                        </Medium>

                        <Small>
                            <SearchBox
                                location={this.props.location}
                                theme="dark"
                            />
                        </Small>
                        <Medium>
                            <SearchBox
                                location={this.props.location}
                                theme="light"
                            />
                        </Medium>

                        {this.renderBody()}
                    </Container>

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
                                <img src={d61logo} alt="data61-logo" />
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
