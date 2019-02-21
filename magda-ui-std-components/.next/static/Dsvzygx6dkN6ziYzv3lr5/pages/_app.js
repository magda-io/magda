(window.stdComponents = window.stdComponents || []).push([
    [4],
    {
        "7ijk": function(e, t, n) {
            (window.__NEXT_P2 = window.__NEXT_P2 || []).push([
                "/_app",
                function() {
                    var e = n("gU5P");
                    return { page: e.default || e };
                }
            ]);
        },
        gU5P: function(e, t, n) {
            "use strict";
            var r = n("IJGv"),
                u = r(n("6/ac")),
                o = r(n("71Dw")),
                a = r(n("8WHb")),
                i = r(n("GUE2")),
                l = r(n("aPDU")),
                c = r(n("if0H")),
                s = r(n("hHLE")),
                f = r(n("XMn/")),
                p = function(e) {
                    if (e && e.__esModule) return e;
                    var t = {};
                    if (null != e)
                        for (var n in e)
                            Object.hasOwnProperty.call(e, n) && (t[n] = e[n]);
                    return (t.default = e), t;
                },
                d = function(e) {
                    return e && e.__esModule ? e : { default: e };
                };
            Object.defineProperty(t, "__esModule", { value: !0 });
            var h = p(n("o01Q")),
                v = d(n("KwfA")),
                m = n("vsG+"),
                w = n("3qLq"),
                y = (function(e) {
                    function t() {
                        return (
                            (0, i.default)(this, t),
                            (0, c.default)(
                                this,
                                (0, s.default)(t).apply(this, arguments)
                            )
                        );
                    }
                    return (
                        (0, f.default)(t, e),
                        (0, l.default)(
                            t,
                            [
                                {
                                    key: "getChildContext",
                                    value: function() {
                                        return {
                                            router: w.makePublicRouterInstance(
                                                this.props.router
                                            )
                                        };
                                    }
                                },
                                {
                                    key: "componentDidCatch",
                                    value: function(e) {
                                        throw e;
                                    }
                                },
                                {
                                    key: "render",
                                    value: function() {
                                        var e = this.props,
                                            t = e.router,
                                            n = e.Component,
                                            r = e.pageProps,
                                            u = _(t);
                                        return h.default.createElement(
                                            k,
                                            null,
                                            h.default.createElement(
                                                n,
                                                (0, a.default)({}, r, {
                                                    url: u
                                                })
                                            )
                                        );
                                    }
                                }
                            ],
                            [
                                {
                                    key: "getInitialProps",
                                    value: (function() {
                                        var e = (0, o.default)(
                                            u.default.mark(function e(t) {
                                                var n, r, o;
                                                return u.default.wrap(
                                                    function(e) {
                                                        for (;;)
                                                            switch (
                                                                (e.prev =
                                                                    e.next)
                                                            ) {
                                                                case 0:
                                                                    return (
                                                                        (n =
                                                                            t.Component),
                                                                        t.router,
                                                                        (r =
                                                                            t.ctx),
                                                                        (e.next = 3),
                                                                        m.loadGetInitialProps(
                                                                            n,
                                                                            r
                                                                        )
                                                                    );
                                                                case 3:
                                                                    return (
                                                                        (o =
                                                                            e.sent),
                                                                        e.abrupt(
                                                                            "return",
                                                                            {
                                                                                pageProps: o
                                                                            }
                                                                        )
                                                                    );
                                                                case 5:
                                                                case "end":
                                                                    return e.stop();
                                                            }
                                                    },
                                                    e,
                                                    this
                                                );
                                            })
                                        );
                                        return function(t) {
                                            return e.apply(this, arguments);
                                        };
                                    })()
                                }
                            ]
                        ),
                        t
                    );
                })(h.Component);
            (y.childContextTypes = { router: v.default.object }),
                (t.default = y);
            var k = (function(e) {
                function t() {
                    return (
                        (0, i.default)(this, t),
                        (0, c.default)(
                            this,
                            (0, s.default)(t).apply(this, arguments)
                        )
                    );
                }
                return (
                    (0, f.default)(t, e),
                    (0, l.default)(t, [
                        {
                            key: "componentDidMount",
                            value: function() {
                                this.scrollToHash();
                            }
                        },
                        {
                            key: "componentDidUpdate",
                            value: function() {
                                this.scrollToHash();
                            }
                        },
                        {
                            key: "scrollToHash",
                            value: function() {
                                var e = window.location.hash;
                                if ((e = !!e && e.substring(1))) {
                                    var t = document.getElementById(e);
                                    t &&
                                        setTimeout(function() {
                                            return t.scrollIntoView();
                                        }, 0);
                                }
                            }
                        },
                        {
                            key: "render",
                            value: function() {
                                return this.props.children;
                            }
                        }
                    ]),
                    t
                );
            })(h.Component);
            t.Container = k;
            var P = m.execOnce(function() {
                0;
            });
            function _(e) {
                var t = e.pathname,
                    n = e.asPath,
                    r = e.query;
                return {
                    get query() {
                        return P(), r;
                    },
                    get pathname() {
                        return P(), t;
                    },
                    get asPath() {
                        return P(), n;
                    },
                    back: function() {
                        P(), e.back();
                    },
                    push: function(t, n) {
                        return P(), e.push(t, n);
                    },
                    pushTo: function(t, n) {
                        P();
                        var r = n ? t : null,
                            u = n || t;
                        return e.push(r, u);
                    },
                    replace: function(t, n) {
                        return P(), e.replace(t, n);
                    },
                    replaceTo: function(t, n) {
                        P();
                        var r = n ? t : null,
                            u = n || t;
                        return e.replace(r, u);
                    }
                };
            }
            t.createUrl = _;
        }
    },
    [["7ijk", 1, 0]]
]);
