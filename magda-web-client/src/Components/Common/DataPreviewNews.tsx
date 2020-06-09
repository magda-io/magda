import React, { Component } from "react";
import { config } from "config";
import fetch from "isomorphic-fetch";
import getDateString from "helpers/getDateString";
import defined from "helpers/defined";
import Spinner from "Components/Common/Spinner";

import { ParsedDistribution } from "helpers/record";

import "./DataPreviewNews.scss";

function loadRssParser() {
    return import(/* webpackChunkName: "rssParser" */ "rss-parser")
        .then((rssParser) => {
            return rssParser;
        })
        .catch((error) => {
            throw new Error("An error occurred while loading the component");
        });
}

export default class News extends Component<
    {
        distribution: ParsedDistribution;
    },
    any
> {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            loading: true,
            newsItems: null
        };
    }
    componentDidUpdate(prevProps) {
        if (
            prevProps.distribution.downloadURL !==
            this.props.distribution.downloadURL
        ) {
            this.fetchData(this.props.distribution.downloadURL);
        }
    }

    componentDidMount() {
        this.fetchData(this.props.distribution.downloadURL);
    }

    fetchData(url) {
        this.setState({
            error: null,
            loading: true,
            newsItems: null
        });
        return fetch(config.proxyUrl + url, config.credentialsFetchOptions)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        `${response.status} (${response.statusText})`
                    );
                } else {
                    return response.text();
                }
            })
            .then((text) =>
                loadRssParser().then((rssParser) => {
                    rssParser.parseString(text, (err, result) => {
                        if (err) {
                            throw new Error("error getting rss feed");
                        } else {
                            this.setState({
                                error: null,
                                loading: false,
                                newsItems: result.feed.entries
                            });
                        }
                    });
                })
            )
            .catch((err) => {
                console.warn(err);
                this.setState({
                    error: err,
                    loading: false,
                    newsItems: null
                });
            });
    }

    renderNews(news) {
        return (
            <li className="news" key={news.link + news.title}>
                <div className="pub-date">
                    {defined(news.pubDate) && getDateString(news.pubDate)}
                </div>
                <h3 className="list-group-item-heading">
                    <a
                        href={news.link}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {news.title}
                    </a>
                </h3>
                <div className="news-body list-group-item-text">
                    {news.contentSnippet}
                </div>
            </li>
        );
    }

    render() {
        if (this.state.error) {
            return (
                <div className="error">
                    <h3>{this.state.error.name}</h3>
                    {this.state.error.message}
                </div>
            );
        }
        if (this.state.loading) {
            return <Spinner height="420px" width="420px" />;
        }
        return (
            <ul className="list--unstyled list-group">
                {this.state.newsItems
                    .slice(0, 3)
                    .map((n) => this.renderNews(n))}
            </ul>
        );
    }
}
