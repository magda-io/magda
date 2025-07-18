import React, { FunctionComponent } from "react";
import { Link } from "react-router-dom";
import uniq from "lodash/uniq";
import reduce from "lodash/reduce";
import ucwords from "ucwords";
import "./TagsBox.scss";

const tagSeperatorRegex = /[,|;|/||]/g;

function mergeTags(tags): string[] {
    return uniq(
        reduce(
            tags,
            (acc: string[], cur) => {
                let items: string[] = [];
                if (typeof cur === "string") {
                    items = items.concat(
                        cur
                            .split(tagSeperatorRegex)
                            .map((item) => item.toLowerCase().trim())
                    );
                } else if (cur?.length && Array.isArray(cur)) {
                    items = items.concat(
                        cur
                            .map((item) => String(item).toLowerCase().trim())
                            .filter((item) => item)
                    );
                }
                return acc.concat(items);
            },
            []
        )
    );
}

interface TagsBoxProps {
    title?: string;
    content?: string[];
}

const DEFAULT_TAGS_HEADING = "Tags: ";

const TagsBox: FunctionComponent<TagsBoxProps> = (props) => {
    const { title, content } = props;
    return (
        <div className="tags-box">
            <div className="description-heading">
                {title ? title : DEFAULT_TAGS_HEADING}:
            </div>
            {props.content && props.content.length > 0 ? (
                <ul className="au-tags">
                    {props.content &&
                        mergeTags(content ? content : [])
                            .sort((a, b) => {
                                if (a < b) return -1;
                                else if (a > b) return 1;
                                else return 0;
                            })
                            .map((t, idx) => (
                                <li key={idx}>
                                    <Link
                                        to={`/search?q=${encodeURIComponent(
                                            t
                                        )}`}
                                        className="au-tag"
                                    >
                                        {ucwords(t)}
                                    </Link>
                                </li>
                            ))}
                </ul>
            ) : (
                <span>No {title ? title : DEFAULT_TAGS_HEADING} defined</span>
            )}
        </div>
    );
};

export default TagsBox;
