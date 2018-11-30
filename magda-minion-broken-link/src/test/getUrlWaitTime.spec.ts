import {} from "mocha";
import jsc from "@magda/typescript-common/dist/test/jsverify";
import getUrlWaitTime, {
    getHostWaitTime,
    defaultDomainWaitTime,
    clearDomainAccessTimeStore
} from "../getUrlWaitTime";
import * as sinon from "sinon";
import * as URI from "urijs";
import { expect } from "chai";
import { distUrlArb } from "@magda/typescript-common/dist/test/arbitraries";

function randomInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

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
    const clock = sinon.useFakeTimers(new Date().getTime());

    const urlArb = (jsc as any).nonshrink(
        distUrlArb({
            schemeArb: jsc.elements(["http", "https"]),
            hostArb: jsc.elements(["example1", "example2", "example3"])
        })
    );

    after(() => {
        clock.restore();
    });

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

    it("should return waitTime x 1 set for a domain if call the second time immediately", () => {
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 99999), async function(
                url: string,
                domainWaitTime: number //--- seconds
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: domainWaitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    domainWaitTime * 1000
                );

                return true;
            })
        );
    });

    it("should return 0 after delayed domainWaitTime before call the second time", () => {
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 200), async function(
                url: string,
                domainWaitTime: number //--- seconds
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: domainWaitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                clock.tick(domainWaitTime * 1000);

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                return true;
            })
        );
    });

    it("should return (domainWaitTime - `Random Delayed Time`) after delayed `Random Delayed Time` (lower than `domainWaitTime`) before call the second time", () => {
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 200), async function(
                url: string,
                domainWaitTime: number //--- seconds
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: domainWaitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                const randomWaitTime = randomInt(1, domainWaitTime * 1000 - 1);

                clock.tick(randomWaitTime);

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    domainWaitTime * 1000 - randomWaitTime
                );

                return true;
            })
        );
    });

    it("should return 0 after delayed `Random Delayed Time` (higher than `domainWaitTime`) before call the second time", () => {
        return jsc.assert(
            jsc.forall(urlArb, jsc.integer(1, 200), async function(
                url: string,
                domainWaitTime: number //--- seconds
            ) {
                clearDomainAccessTimeStore();

                const uri = new URI(url);
                const host = uri.hostname();
                const domainWaitTimeConfig = {
                    [host]: domainWaitTime
                };

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                const randomWaitTime = randomInt(
                    domainWaitTime * 1000 + 1,
                    domainWaitTime * 1000 * 2
                );

                clock.tick(randomWaitTime);

                expect(getUrlWaitTime(url, domainWaitTimeConfig)).to.be.equal(
                    0
                );

                return true;
            })
        );
    });
});
