import React, { Component } from "react";
import { needsContent } from "helpers/content";
import { Link } from "react-router-dom";
import queryString from "query-string";

import "./Pagination.scss";

import left_arrow from "assets/left-arrow.svg";
import right_arrow from "assets/right-arrow.svg";

class Pagination extends Component {
    constructor(props) {
        super(props);
        this.renderNextButton = this.renderNextButton.bind(this);
        this.renderPrevButton = this.renderPrevButton.bind(this);
        this.generateRoute = this.generateRoute.bind(this);
    }

    // generates the href for each link-list-item in pagination list.
    generateRoute(page) {
        return (
            this.props.location.pathname +
            "?" +
            queryString.stringify(
                Object.assign(queryString.parse(this.props.location.search), {
                    page: page
                })
            )
        );
    }

    renderPrevButton(currentIndex) {
        return (
            <li>
                <Link
                    to={this.generateRoute(currentIndex - 1)}
                    className="btn-prev"
                    aria-label="previous page"
                >
                    {" "}
                    <img src={left_arrow} alt="" />{" "}
                </Link>
            </li>
        );
    }

    renderNextButton(currentIndex) {
        return (
            <li>
                <Link
                    to={this.generateRoute(currentIndex + 1)}
                    className="btn-next"
                    aria-label="next page"
                >
                    {" "}
                    <img src={right_arrow} alt="" />{" "}
                </Link>
            </li>
        );
    }

    renderDisabledButton() {
        return <button disabled={true}>...</button>;
    }

    /**
     * The `renderPageList` function implementation should meet the following rules:
     * Rule 1: The maximum total no. of page no. buttons is 7 (including a ... button)
     *   unless total page no. is less than 7
     * Rule 2: The minimum total no. of page no. buttons is 5 unless total page no. is less than 5
     * Rule 3: There should be 2 buttons on the right hand side of the current page button
     *   unless ( total page no. - current page) is unless than 2.
     * Rule 4: Page 1 button should always be the first button
     * Rule 5: Buttons on the left hand side of current page button should be listed sequentially
     *   (higher page no to lower, from right to left) one by one until page 1
     *   or total button no. reaches no. specified by rule 1 & 2.
     *   If any page no. are left, a ... button will be created.
     * Rule 6: `...` button is clickable and it will take user to current page - 4
     */

    renderPageList(maxPage, currentPage) {
        let current = currentPage,
            max = maxPage;

        //--- make sure values always stay in range
        if (!(current >= 1)) {
            current = 1;
        }

        if (!(max >= current)) {
            if (max >= 1) {
                current = max;
            } else {
                max = current;
            }
        }

        //-- Rule 1
        const maxPageButtonNum = 7;
        //-- Rule 2
        const minPageButtonNum = Math.min(max, 5);
        const currentPageButtonNum = Math.min(
            current - 1 + minPageButtonNum,
            max,
            maxPageButtonNum
        );

        const pageButtons = new Array(currentPageButtonNum);
        //-- Rule 4: first button always be page 1
        pageButtons[0] = 1;

        //-- Rule 3
        const minButtonsOnRight = 2;

        //-- current page button is freely move within 1 to currentPageButtonNum
        //-- plus it must not beyond `maxPageNo` and must meet Rule 3
        let currentButtonPos = Math.min(current, currentPageButtonNum);
        if (currentPageButtonNum - currentButtonPos < minButtonsOnRight) {
            currentButtonPos =
                currentPageButtonNum -
                Math.min(minButtonsOnRight, max - current);
        }

        //-- how many buttons aren't filled yet on the left (excluding current)
        let leftButtonsNum = currentPageButtonNum;
        //-- fill buttons on the right (including current)
        for (let i = 0; currentButtonPos - 1 + i < pageButtons.length; i++) {
            pageButtons[currentButtonPos - 1 + i] = current + i;
            leftButtonsNum--;
        }

        //-- first button has been taken -- always be 1 (Rule 4)
        //-- thus, take 1 off
        leftButtonsNum--;
        //-- fill buttons on the left
        if (leftButtonsNum > 0) {
            //-- We need to leave one place for potential `...` button
            let nextPageNum = current - 1;
            for (let i = 0; i < leftButtonsNum - 1; i++) {
                pageButtons[currentButtonPos - 1 - 1 - i] = nextPageNum;
                nextPageNum--;
            }
            //-- if more than 1 place to fill, create `...` button (use 0 stands for `...`)
            if (nextPageNum - 1 > 1) {
                pageButtons[1] = 0;
            } else {
                pageButtons[1] = nextPageNum;
            }
        }

        return (
            <ul className="pagination-list ">
                {current > 1 && this.renderPrevButton(current)}
                {pageButtons.map((i) => (
                    <li key={i}>
                        <Link
                            to={this.generateRoute(
                                //-- if i===0 then it's `...` button, Rule 6 applies
                                i === 0 ? current - 4 : i
                            )}
                            className={`${
                                i === current ? "current" : "non-current"
                            }`}
                            aria-current={i === current ? "true" : "false"}
                            aria-label={`Page ${i === 0 ? current - 4 : i}`}
                        >
                            {i === 0 ? "..." : i}
                        </Link>
                    </li>
                ))}
                {current < max && this.renderNextButton(current)}
            </ul>
        );
    }

    render() {
        const currentPage = this.props.currentPage;
        const searchResultsPerPage = this.props.configuration
            .searchResultsPerPage;

        return (
            <div
                className="pagination"
                role="navigation"
                aria-label="Page navigation"
            >
                {this.renderPageList(this.props.maxPage, currentPage)}
                <div className="pagination-summary">
                    {" "}
                    {(currentPage - 1) * searchResultsPerPage + 1} -{" "}
                    {Math.min(
                        currentPage * searchResultsPerPage,
                        this.props.totalItems
                    )}{" "}
                    of {this.props.totalItems} results
                </div>
            </div>
        );
    }
}

export default needsContent("configuration")(Pagination);
