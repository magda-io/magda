import React from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import uniq from "lodash.uniq";
import reduce from "lodash.reduce";
import "./TagsBox.css";

const tagSeperatorRegex = /[,|;|/||]/g;

function mergeTags(tags) {
    return uniq(
        reduce(
            tags,
            (acc, cur) => {
                return acc.concat(
                    cur
                        .split(tagSeperatorRegex)
                        .map(item => item.toLowerCase().trim())
                );
            },
            []
        )
    );
}

function TagsBox(props) {
    return (
        <div className="tags-box">
            <table width="100%">
                <tbody>
                    <tr>
                        <td className="heading">Tags: </td>
                        <td>
                            <ul>
                                {props.tags &&
                                    mergeTags(props.tags)
                                        .sort((a, b) => {
                                            if (a < b) return -1;
                                            else if (a > b) return 1;
                                            else return 0;
                                        })
                                        .map((t,idx) => (
                                            <li key={t} className={idx?"other-tag":"first-tag"}>
                                                <Link
                                                    key={t}
                                                    to={`/search?q=${encodeURIComponent(
                                                        t
                                                    )}`}
                                                >
                                                    {t}
                                                </Link>
                                            </li>
                                        ))}
                            </ul>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

TagsBox.propTypes = {
    tags: PropTypes.arrayOf(PropTypes.string)
};

TagsBox.defaultProps = {
    tags: []
};

export default TagsBox;
