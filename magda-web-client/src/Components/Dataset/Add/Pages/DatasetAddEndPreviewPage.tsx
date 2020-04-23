import React from "react";

import { Link } from "react-router-dom";

// If you are in Preview Mode
export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row people-and-production-page">
            <div className="col-sm-12">
                <h2>You've completed the Add Dataset Preview!</h2>
                <hr />
                <p>
                    Soon, you'll be able to submit the dataset so that it can be
                    discovered via search and shared with your colleagues. For
                    now, your dataset is saved on your local computer, and you
                    can see it at any time in the{" "}
                    <Link to="/dataset/list">drafts page</Link>.
                </p>

                <p>
                    In the meantime, we on the Magda team are looking for
                    feedback on the process you just completed. If you'd like to
                    let us know how we did, please click the "Send Us Your
                    Thoughts" button below:
                </p>
                <p>Thanks!</p>
                <p>
                    Alex, Alyce, Jacky and Mel from the{" "}
                    <a href="https://magda.io">Magda</a> team at CSIRO's Data61.
                </p>
            </div>
        </div>
    );
}
