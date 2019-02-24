import React from "react";
import { Link } from "react-router-dom";
import PropTypes from "prop-types";
import uniq from "lodash/uniq";
import reduce from "lodash/reduce";
import AUtags from "../pancake/react/tags";
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
            <div className="heading">Tags: </div>
            <AUtags
                tags={
                    props.tags &&
                    mergeTags(props.tags)
                        .sort((a, b) => {
                            if (a < b) return -1;
                            else if (a > b) return 1;
                            else return 0;
                        })
                        .map((t, _) => ({
                            link: `/search?q=${encodeURIComponent(t)}`,
                            text: t
                        }))
                }
                linkComponent={Link}
            />
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
