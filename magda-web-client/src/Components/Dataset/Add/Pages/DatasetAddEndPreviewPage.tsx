import React from "react";

// import { Link } from "react-router-dom";
import giantTick from "assets/giant-tick.svg";

export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row end-preview-page">
            <div className="col-sm-12">
                <h2>
                    You're all done! <img src={giantTick} />
                </h2>
                <hr />
                <p>Your dataset has been successfully sent off for approval.</p>

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
