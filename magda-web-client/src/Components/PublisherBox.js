import React from "react";
import { Link } from "react-router-dom";
import "./PublisherBox.css";

export default function PublisherBox(props) {
    const publisher = props.publisher;
    return (
        <div className="white-box publisher-box">
            <div className="inner">
                <h3>
                    <Link to={`publishers/${encodeURIComponent(publisher.id)}`}>
                        {publisher.name}
                    </Link>
                </h3>
                <div className="">{publisher["description"]}</div>
                <Link
                    to={`/search?publisher=${encodeURIComponent(
                        publisher.name
                    )}`}
                >
                    View all datasets
                </Link>
            </div>
        </div>
    );
}
