import { expect } from "chai";
import AsyncPage, { forEachAsync } from "../AsyncPage";
import "mocha";

describe("AsyncPage", function() {
    describe("single", function() {
        it("can be iterated", function() {
            const o = {};
            const page = AsyncPage.single(o);
            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(o);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can be mapped", function() {
            const value = 1;
            const page = AsyncPage.single(value).map(v => v + 1);
            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(2);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can take 0", function() {
            const value = {};
            const page = AsyncPage.single(value).take(0);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });

        it("can take 1", function() {
            const value = {};
            const page = AsyncPage.single(value).take(1);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(value);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can take 2", function() {
            const value = {};
            const page = AsyncPage.single(value).take(2);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(value);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });
    });

    describe("none", function() {
        it("can be iterated", function() {
            return AsyncPage.none().forEach(item => {
                expect.fail("no items", "an item");
            });
        });

        it("can be mapped", function() {
            const page = AsyncPage.none<number>().map(v => v + 1);
            return page.forEach(item => {
                expect.fail("no items", "an item");
            });
        });

        it("can take 0", function() {
            const page = AsyncPage.none().take(0);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });

        it("can take 1", function() {
            const page = AsyncPage.none().take(1);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });

        it("can take 2", function() {
            const page = AsyncPage.none().take(2);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });
    });

    describe("singlePromise", function() {
        it("can be iterated", function() {
            const o = {};
            const page = AsyncPage.singlePromise(
                new Promise((resolve, reject) => {
                    resolve(o);
                })
            );
            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(o);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can be mapped", function() {
            const value = 1;
            const page = AsyncPage.singlePromise<number>(
                new Promise((resolve, reject) => {
                    resolve(value);
                })
            );
            const mapped = page.map(v => v + 1);
            let calls = 0;
            return mapped
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(2);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can take 0", function() {
            const o = {};
            const page = AsyncPage.singlePromise(
                new Promise((resolve, reject) => {
                    resolve(o);
                })
            ).take(0);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });

        it("can take 1", function() {
            const o = {};
            const page = AsyncPage.singlePromise(
                new Promise((resolve, reject) => {
                    resolve(o);
                })
            ).take(1);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(o);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });

        it("can take 2", function() {
            const o = {};
            const page = AsyncPage.singlePromise(
                new Promise((resolve, reject) => {
                    resolve(o);
                })
            ).take(2);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                    expect(calls).to.equal(1);
                    expect(item).to.equal(o);
                })
                .then(() => {
                    expect(calls).to.equal(1);
                });
        });
    });

    describe("create", function() {
        it("can be iterated", function() {
            let selectorCalls = 0;
            const page = AsyncPage.create<number>(value => {
                ++selectorCalls;
                if (value === undefined) {
                    return Promise.resolve(0);
                } else if (value < 10) {
                    return Promise.resolve(value + 1);
                } else {
                    return undefined;
                }
            });

            let calls = 0;
            return page
                .forEach(item => {
                    expect(item).to.equal(calls);
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(11);
                    expect(selectorCalls).to.equal(12);
                });
        });

        it("can be mapped", function() {
            const page = AsyncPage.create<number>(value => {
                if (value === undefined) {
                    return Promise.resolve(0);
                } else if (value < 10) {
                    return Promise.resolve(value + 1);
                } else {
                    return undefined;
                }
            });
            const mapped = page.map(v => v + 1);
            let calls = 0;
            return mapped
                .forEach(item => {
                    expect(item).to.equal(calls + 1);
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(11);
                });
        });

        it("can take 0", function() {
            let selectorCalls = 0;
            const page = AsyncPage.create<number>(value => {
                ++selectorCalls;
                if (value === undefined) {
                    return Promise.resolve(0);
                } else if (value < 10) {
                    return Promise.resolve(value + 1);
                } else {
                    return undefined;
                }
            }).take(0);

            let calls = 0;
            return page
                .forEach(item => {
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(0);
                });
        });

        it("can take 1", function() {
            let selectorCalls = 0;
            const page = AsyncPage.create<number>(value => {
                ++selectorCalls;
                if (value === undefined) {
                    return Promise.resolve(0);
                } else if (value < 10) {
                    return Promise.resolve(value + 1);
                } else {
                    return undefined;
                }
            }).take(1);

            let calls = 0;
            return page
                .forEach(item => {
                    expect(item).to.equal(calls);
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(1);
                    expect(selectorCalls).to.equal(2);
                });
        });

        it("can take 2", function() {
            let selectorCalls = 0;
            const page = AsyncPage.create<number>(value => {
                ++selectorCalls;
                if (value === undefined) {
                    return Promise.resolve(0);
                } else if (value < 10) {
                    return Promise.resolve(value + 1);
                } else {
                    return undefined;
                }
            }).take(2);

            let calls = 0;
            return page
                .forEach(item => {
                    expect(item).to.equal(calls);
                    ++calls;
                })
                .then(() => {
                    expect(calls).to.equal(2);
                    expect(selectorCalls).to.equal(3);
                });
        });
    });

    describe("forEachAsync", function() {
        it("works with AsyncPage.none", function() {
            return forEachAsync(AsyncPage.none<number[]>(), 6, function(value) {
                expect.fail("no items", "an item");
                return Promise.resolve();
            });
        });

        it("works with AsyncPage.single and an empty array", function() {
            return forEachAsync(AsyncPage.single<number[]>([]), 6, function(
                value
            ) {
                expect.fail("no items", "an item");
                return Promise.resolve();
            });
        });

        it("works with AsyncPage.single and a non-empty array", function() {
            let calls = 0;
            return forEachAsync(AsyncPage.single<number[]>([4]), 6, function(
                value
            ) {
                ++calls;
                expect(value).to.equal(4);
                return Promise.resolve();
            }).then(function() {
                expect(calls).to.equal(1);
            });
        });

        it("works with AsyncPage.singlePromise and a non-empty array", function() {
            let calls = 0;
            return forEachAsync(
                AsyncPage.singlePromise<number[]>(Promise.resolve([4])),
                6,
                function(value) {
                    ++calls;
                    expect(value).to.equal(4);
                    return Promise.resolve();
                }
            ).then(function() {
                expect(calls).to.equal(1);
            });
        });

        it("works with multiple pages of arrays", function() {
            const pages = [
                { page: 0, values: [1, 2] },
                { page: 1, values: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
                { page: 2, values: [13, 14] }
            ];

            const pager = AsyncPage.create((previous: typeof pages[0]) => {
                const index = previous === undefined ? 0 : previous.page + 1;
                if (index >= pages.length) {
                    return undefined;
                } else {
                    return Promise.resolve(pages[index]);
                }
            });

            const arrayPager = pager.map(page => page.values);

            let values: number[] = [];
            return forEachAsync(arrayPager, 6, function(value) {
                values.push(value);
                return Promise.resolve();
            }).then(function() {
                expect(values.length).to.equal(14);
                expect(values).to.eql([
                    1,
                    2,
                    3,
                    4,
                    5,
                    6,
                    7,
                    8,
                    9,
                    10,
                    11,
                    12,
                    13,
                    14
                ]);
            });
        });

        it("works when some pages are an empty array", function() {
            const pages = [
                { page: 0, values: [] },
                { page: 1, values: [1, 2] },
                { page: 2, values: [] },
                { page: 3, values: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
                { page: 4, values: [] },
                { page: 5, values: [13, 14] },
                { page: 6, values: [] }
            ];

            const pager = AsyncPage.create((previous: typeof pages[0]) => {
                const index = previous === undefined ? 0 : previous.page + 1;
                if (index >= pages.length) {
                    return undefined;
                } else {
                    return Promise.resolve(pages[index]);
                }
            });

            const arrayPager = pager.map(page => page.values);

            let values: number[] = [];
            return forEachAsync(arrayPager, 6, function(value) {
                values.push(value);
                return Promise.resolve();
            }).then(function() {
                expect(values.length).to.equal(14);
                expect(values).to.eql([
                    1,
                    2,
                    3,
                    4,
                    5,
                    6,
                    7,
                    8,
                    9,
                    10,
                    11,
                    12,
                    13,
                    14
                ]);
            });
        });
    });
});
