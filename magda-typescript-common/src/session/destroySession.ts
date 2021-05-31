import express from "express";

/**
 * destroy the session.
 *  - will delete the session data from session store only.
 *  - will not delete session cookie (Call deleteCookie method for deleting cookie)
 * @export
 * @param {express.Request} req
 * @return {*}  {Promise<void>}
 */
export default async function destroySession(
    req: express.Request
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (req?.session?.destroy) {
            req.session.destroy((err) => {
                if (err) {
                    // Failed to access session storage to delete session data
                    reject(err);
                } else {
                    resolve();
                }
            });
        } else {
            // --- express-session 1.17 may not always initialise session
            // --- if req.session not exist, should just resolve promise
            resolve();
        }
    });
}
