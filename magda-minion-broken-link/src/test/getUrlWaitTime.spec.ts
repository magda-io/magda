import {} from "mocha";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import getUrlWaitTime, {
    getHostWaitTime,
    defaultDomainWaitTime,
    clearDomainAccessTimeStore
} from "../getUrlWaitTime";
import wait from "../wait";
import * as URI from "urijs";
import { expect } from "chai";
import { distUrlArb } from "@magda/typescript-common/dist/test/arbitraries";

describe("getHostWaitTime", () => {
    it("should return waitTime set for a domain if available", () => {
        return jsc.assert(
            jsc.forall(jsc.nestring, jsc.integer(1), (host, waitTime) => {
                const domainWaitTimeConfig = {
                    [host]: waitTime
                };
                expect(getHostWaitTime(host, domainWaitTimeConfig)).to.equal(
                    waitTime
                );
                return true;
            })
        );
    });

    it("should return global default waitTime for a domain if not set", () => {
        return jsc.assert(
            jsc.forall(jsc.nestring, jsc.integer(1), (host, waitTime) => {
                const domainWaitTimeConfig = {
                    [host]: waitTime
                };
                expect(
                    getHostWaitTime(
                        `${host}_extra_suffix`,
                        domainWaitTimeConfig
                    )
                ).to.equal(defaultDomainWaitTime);
                return true;
            })
        );
    });
});

describe("getUrlWaitTime", () => {
    const urlArb = (jsc as any).nonshrink(
        distUrlArb({
            schemeArb: jsc.elements(["http", "https"]),
            hostArb: jsc.elements(["example1", "example2", "example3"])
        })
    );

    it("should return 0 if it's the first time for the domain", () => {
        return jsc.assert(
            jsc.forall(
                urlArb,
                jsc.integer(1),
                (url: string, waitTime: number) => {
                    clearDomainAccessTimeStore();

                    const uri = new URI(url);
                    const host = uri.hostname();
                    const domainWaitTimeConfig = {
                        [host]: waitTime
                    };

                    expect(
                        getUrlWaitTime(url, domainWaitTimeConfig)
                    ).to.be.equal(0);

                    return true;
                }
            )
        );
    });

    it("should return waitTime x 2 set for a domain if call the second time", () => {
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 99999), async function(
                url: string,
                waitTime: number
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: waitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.closeTo(
                    waitTime * 1000 * 2,
                    1
                );

                return true;
            })
        );
    });

    it("should return waitTime set for a domain if delay waitTime before call the second time", function(this: Mocha.ISuiteCallbackContext) {
        this.timeout(20000);
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 20), async function(
                url: string,
                waitTime: number
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: waitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                await wait(waitTime);

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.closeTo(
                    waitTime * 1000 * 2,
                    900
                );

                return true;
            })
        );
    });
});
