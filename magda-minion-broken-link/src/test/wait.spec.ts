import {} from "mocha";
import _ from "lodash";
import jsc from "magda-typescript-common/src/test/jsverify";
import { expect } from "chai";
import wait from "../wait";
import { shrink } from "jsverify";

describe("wait function", () => {
    it("should return resolved promise if passed 0 parameter", done => {
        const promise = wait(0);
        let isResolved = false;
        promise.then(() => {
            isResolved = true;
        });
        _.defer(() => {
            expect(isResolved).to.equal(true);
            done();
        });
    });

    it("should wait around `waitTime` milliseconds", async function(this: Mocha.ISuiteCallbackContext) {
        this.timeout(10000);
        return jsc.assert(
            jsc.forall(
                { ...jsc.integer(1, 2000), shrink: shrink.noop },
                async function(waitTime: number) {
                    const now = new Date().getTime();
                    await wait(waitTime);
                    const newTime = new Date().getTime();
                    expect(newTime).to.be.closeTo(now + waitTime, 100);
                    return true;
                }
            ),
            { tests: 3 }
        );
    });
});
