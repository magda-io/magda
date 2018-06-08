import React, { Component } from "react";
import { config } from "../config";
import left_arrow from "../assets/left-arrow.svg";
import right_arrow from "../assets/right-arrow.svg";
import "./Pagination.css";

class Pagination extends Component {
    constructor(props) {
        super(props);
        this.onClick = this.onClick.bind(this);
        this.renderNextButton = this.renderNextButton.bind(this);
        this.renderPrevButton = this.renderPrevButton.bind(this);
    }

    onClick(page) {
        this.props.onPageChange(page);
    }
    renderPrevButton(currentIndex) {
        return (
            <button
                onClick={this.onClick.bind(this, currentIndex - 1)}
                className="btn-prev"
            >
                {" "}
                <img src={left_arrow} alt="previous page" />{" "}
            </button>
        );
    }

    renderNextButton(currentIndex) {
        return (
            <button
                onClick={this.onClick.bind(this, currentIndex + 1)}
                className="btn-nexty"
            >
                {" "}
                <img src={right_arrow} alt="next page" />{" "}
            </button>
        );
    }

    renderDisabledButton() {
        return <button disabled={true}>...</button>;
    }

    renderPageList(max, current) {
        //--- make sure values always stay in range
        if (!(current >= 1)) current = 1;
        if (!(max >= current)) {
            if (max >= 1) current = max;
            else max = current;
        }

        //-- Rule 1: detail see my issue comment on github
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

        //-- Rule 3: unless reach (currentPageButtonNum - current) or (max - current)
        const minButtonsOnRight = 2;

        //-- Rule 5
        const numOfButtonsOnRight = Math.min(
            Math.max(
                //-- when current is close to the right boundary, we won't create more buttons
                Math.min(currentPageButtonNum - current, minButtonsOnRight),
                //-- when current is close to the left boundary, we try create as many button as possible
                max - current
            ),
            //-- Still keep in mind that we only want to generate limited number of buttons
            currentPageButtonNum - current
        );

        for (
            //-- start from `current page`
            let initialPos = currentPageButtonNum - numOfButtonsOnRight - 1,
                i = initialPos;
            i < pageButtons.length;
            i++
        )
            pageButtons[i] = current + (i - initialPos);

        console.log(max, current, currentPageButtonNum);
        const pages = [...Array(max).keys()].map(x => ++x);
        const margins = [...Array(3).keys()].map(x => ++x);
        if (max > 5) {
            if (current <= 3 || current === max) {
                return (
                    <ul className="pagination-list">
                        {current > 1 && this.renderPrevButton(current)}
                        {margins.map(i => (
                            <li key={i}>
                                <button
                                    onClick={this.onClick.bind(this, i)}
                                    className={`${
                                        i === current
                                            ? "current"
                                            : "non-current"
                                    }`}
                                >
                                    {i}
                                </button>
                            </li>
                        ))}
                        <li>{this.renderDisabledButton()}</li>
                        <li>
                            <button
                                onClick={this.onClick.bind(this, max)}
                                className={`${
                                    max === current ? "current" : "non-current"
                                }`}
                            >
                                {max}
                            </button>
                        </li>
                        {current < max && this.renderNextButton(current)}
                    </ul>
                );
            }
            return (
                <ul className="pagination-list">
                    {current > 1 && this.renderPrevButton(current)}
                    {margins.map(i => (
                        <li key={i}>
                            <button onClick={this.onClick.bind(this, i)}>
                                {i}
                            </button>
                        </li>
                    ))}
                    <li>{this.renderDisabledButton()}</li>
                    <li>
                        <button
                            onClick={this.onClick.bind(this, current)}
                            className="current"
                        >
                            {current}
                        </button>
                    </li>
                    <li>{this.renderDisabledButton()}</li>
                    <li>
                        <button onClick={this.onClick.bind(this, max)}>
                            {max}
                        </button>
                    </li>
                    {current < max && this.renderNextButton(current)}
                </ul>
            );
        } else {
            return (
                <ul className="pagination-list">
                    {current > 1 && this.renderPrevButton(current)}
                    {pages.map(i => (
                        <li key={i}>
                            <button
                                onClick={this.onClick.bind(this, i)}
                                className={`${
                                    i === current ? "current" : "non-current"
                                }`}
                            >
                                {i}
                            </button>
                        </li>
                    ))}
                    {current < max && this.renderNextButton(current)}
                </ul>
            );
        }
    }

    render() {
        let currentPage = this.props.currentPage;
        let startIndex =
            currentPage === 1 ? 1 : currentPage * config.resultsPerPage + 1;

        return (
            <div className="pagination">
                {this.renderPageList(this.props.maxPage, currentPage)}
                <div className="pagination-summray">
                    {" "}
                    {startIndex} - {startIndex + config.resultsPerPage} of{" "}
                    {this.props.totalItems} results
                </div>
            </div>
        );
    }
}

export default Pagination;
