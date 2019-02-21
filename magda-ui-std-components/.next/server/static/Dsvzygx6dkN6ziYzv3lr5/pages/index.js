module.exports = /******/ (function(modules) {
    // webpackBootstrap
    /******/ // The module cache
    /******/ var installedModules = require("../../../ssr-module-cache.js"); // object to store loaded chunks // "0" means "already loaded"
    /******/
    /******/ /******/ /******/ var installedChunks = {
        /******/ 5: 0
        /******/
    }; // The require function
    /******/
    /******/ /******/ function __webpack_require__(moduleId) {
        /******/
        /******/ // Check if module is in cache
        /******/ if (installedModules[moduleId]) {
            /******/ return installedModules[moduleId].exports;
            /******/
        } // Create a new module (and put it into the cache)
        /******/ /******/ var module = (installedModules[moduleId] = {
            /******/ i: moduleId,
            /******/ l: false,
            /******/ exports: {}
            /******/
        }); // Execute the module function
        /******/
        /******/ /******/ var threw = true;
        /******/ try {
            /******/ modules[moduleId].call(
                module.exports,
                module,
                module.exports,
                __webpack_require__
            );
            /******/ threw = false;
            /******/
        } finally {
            /******/ if (threw) delete installedModules[moduleId];
            /******/
        } // Flag the module as loaded
        /******/
        /******/ /******/ module.l = true; // Return the exports of the module
        /******/
        /******/ /******/ return module.exports;
        /******/
    } // This file contains only the entry chunk. // The chunk loading function for additional chunks
    /******/
    /******/ /******/ /******/ __webpack_require__.e = function requireEnsure(
        chunkId
    ) {
        /******/ var promises = []; // require() chunk loading for javascript // "0" is the signal for "already loaded"
        /******/
        /******/
        /******/ /******/
        /******/ /******/ if (installedChunks[chunkId] !== 0) {
            /******/ var chunk = require("../../../" +
                ({}[chunkId] || chunkId) +
                "." +
                { "0": "5518ca0d82eb0c077efa", "1": "b22bd9ede7a2fd7b086d" }[
                    chunkId
                ] +
                ".js");
            /******/ var moreModules = chunk.modules,
                chunkIds = chunk.ids;
            /******/ for (var moduleId in moreModules) {
                /******/ modules[moduleId] = moreModules[moduleId];
                /******/
            }
            /******/ for (var i = 0; i < chunkIds.length; i++)
                /******/ installedChunks[chunkIds[i]] = 0;
            /******/
        }
        /******/ return Promise.all(promises);
        /******/
    }; // expose the modules object (__webpack_modules__)
    /******/
    /******/ /******/ __webpack_require__.m = modules; // expose the module cache
    /******/
    /******/ /******/ __webpack_require__.c = installedModules; // define getter function for harmony exports
    /******/
    /******/ /******/ __webpack_require__.d = function(exports, name, getter) {
        /******/ if (!__webpack_require__.o(exports, name)) {
            /******/ Object.defineProperty(exports, name, {
                enumerable: true,
                get: getter
            });
            /******/
        }
        /******/
    }; // define __esModule on exports
    /******/
    /******/ /******/ __webpack_require__.r = function(exports) {
        /******/ if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            /******/ Object.defineProperty(exports, Symbol.toStringTag, {
                value: "Module"
            });
            /******/
        }
        /******/ Object.defineProperty(exports, "__esModule", { value: true });
        /******/
    }; // create a fake namespace object // mode & 1: value is a module id, require it // mode & 2: merge all properties of value into the ns // mode & 4: return value when already ns object // mode & 8|1: behave like require
    /******/
    /******/ /******/ /******/ /******/ /******/ /******/ __webpack_require__.t = function(
        value,
        mode
    ) {
        /******/ if (mode & 1) value = __webpack_require__(value);
        /******/ if (mode & 8) return value;
        /******/ if (
            mode & 4 &&
            typeof value === "object" &&
            value &&
            value.__esModule
        )
            return value;
        /******/ var ns = Object.create(null);
        /******/ __webpack_require__.r(ns);
        /******/ Object.defineProperty(ns, "default", {
            enumerable: true,
            value: value
        });
        /******/ if (mode & 2 && typeof value != "string")
            for (var key in value)
                __webpack_require__.d(
                    ns,
                    key,
                    function(key) {
                        return value[key];
                    }.bind(null, key)
                );
        /******/ return ns;
        /******/
    }; // getDefaultExport function for compatibility with non-harmony modules
    /******/
    /******/ /******/ __webpack_require__.n = function(module) {
        /******/ var getter =
            module && module.__esModule
                ? /******/ function getDefault() {
                      return module["default"];
                  }
                : /******/ function getModuleExports() {
                      return module;
                  };
        /******/ __webpack_require__.d(getter, "a", getter);
        /******/ return getter;
        /******/
    }; // Object.prototype.hasOwnProperty.call
    /******/
    /******/ /******/ __webpack_require__.o = function(object, property) {
        return Object.prototype.hasOwnProperty.call(object, property);
    }; // __webpack_public_path__
    /******/
    /******/ /******/ __webpack_require__.p = ""; // uncaught error handler for webpack runtime
    /******/
    /******/ /******/ __webpack_require__.oe = function(err) {
        /******/ process.nextTick(function() {
            /******/ throw err; // catch this error by using import().catch()
            /******/
        });
        /******/
    }; // Load entry module and return exports
    /******/
    /******/
    /******/ /******/ return __webpack_require__((__webpack_require__.s = 0));
    /******/
})(
    /************************************************************************/
    /******/ {
        /***/ "/+oN": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/get-prototype-of");

            /***/
        },

        /***/ 0: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("23aj");

            /***/
        },

        /***/ "23aj": /***/ function(
            module,
            __webpack_exports__,
            __webpack_require__
        ) {
            "use strict";
            __webpack_require__.r(__webpack_exports__);

            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/regenerator/index.js
            var regenerator = __webpack_require__("UrUy");
            var regenerator_default = /*#__PURE__*/ __webpack_require__.n(
                regenerator
            );

            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/promise.js
            var promise = __webpack_require__("ZOIa");
            var promise_default = /*#__PURE__*/ __webpack_require__.n(promise);

            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/asyncToGenerator.js

            function asyncGeneratorStep(
                gen,
                resolve,
                reject,
                _next,
                _throw,
                key,
                arg
            ) {
                try {
                    var info = gen[key](arg);
                    var value = info.value;
                } catch (error) {
                    reject(error);
                    return;
                }

                if (info.done) {
                    resolve(value);
                } else {
                    promise_default.a.resolve(value).then(_next, _throw);
                }
            }

            function _asyncToGenerator(fn) {
                return function() {
                    var self = this,
                        args = arguments;
                    return new promise_default.a(function(resolve, reject) {
                        var gen = fn.apply(self, args);

                        function _next(value) {
                            asyncGeneratorStep(
                                gen,
                                resolve,
                                reject,
                                _next,
                                _throw,
                                "next",
                                value
                            );
                        }

                        function _throw(err) {
                            asyncGeneratorStep(
                                gen,
                                resolve,
                                reject,
                                _next,
                                _throw,
                                "throw",
                                err
                            );
                        }

                        _next(undefined);
                    });
                };
            }
            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/classCallCheck.js
            function _classCallCheck(instance, Constructor) {
                if (!(instance instanceof Constructor)) {
                    throw new TypeError("Cannot call a class as a function");
                }
            }
            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/object/define-property.js
            var define_property = __webpack_require__("hHgk");
            var define_property_default = /*#__PURE__*/ __webpack_require__.n(
                define_property
            );

            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/createClass.js

            function _defineProperties(target, props) {
                for (var i = 0; i < props.length; i++) {
                    var descriptor = props[i];
                    descriptor.enumerable = descriptor.enumerable || false;
                    descriptor.configurable = true;
                    if ("value" in descriptor) descriptor.writable = true;

                    define_property_default()(
                        target,
                        descriptor.key,
                        descriptor
                    );
                }
            }

            function _createClass(Constructor, protoProps, staticProps) {
                if (protoProps)
                    _defineProperties(Constructor.prototype, protoProps);
                if (staticProps) _defineProperties(Constructor, staticProps);
                return Constructor;
            }
            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/symbol/iterator.js
            var iterator = __webpack_require__("t+lh");
            var iterator_default = /*#__PURE__*/ __webpack_require__.n(
                iterator
            );

            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/symbol.js
            var symbol = __webpack_require__("XzKa");
            var symbol_default = /*#__PURE__*/ __webpack_require__.n(symbol);

            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/typeof.js

            function typeof_typeof2(obj) {
                if (
                    typeof symbol_default.a === "function" &&
                    typeof iterator_default.a === "symbol"
                ) {
                    typeof_typeof2 = function _typeof2(obj) {
                        return typeof obj;
                    };
                } else {
                    typeof_typeof2 = function _typeof2(obj) {
                        return obj &&
                            typeof symbol_default.a === "function" &&
                            obj.constructor === symbol_default.a &&
                            obj !== symbol_default.a.prototype
                            ? "symbol"
                            : typeof obj;
                    };
                }
                return typeof_typeof2(obj);
            }

            function typeof_typeof(obj) {
                if (
                    typeof symbol_default.a === "function" &&
                    typeof_typeof2(iterator_default.a) === "symbol"
                ) {
                    typeof_typeof = function _typeof(obj) {
                        return typeof_typeof2(obj);
                    };
                } else {
                    typeof_typeof = function _typeof(obj) {
                        return obj &&
                            typeof symbol_default.a === "function" &&
                            obj.constructor === symbol_default.a &&
                            obj !== symbol_default.a.prototype
                            ? "symbol"
                            : typeof_typeof2(obj);
                    };
                }

                return typeof_typeof(obj);
            }
            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/assertThisInitialized.js
            function _assertThisInitialized(self) {
                if (self === void 0) {
                    throw new ReferenceError(
                        "this hasn't been initialised - super() hasn't been called"
                    );
                }

                return self;
            }
            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/possibleConstructorReturn.js

            function _possibleConstructorReturn(self, call) {
                if (
                    call &&
                    (typeof_typeof(call) === "object" ||
                        typeof call === "function")
                ) {
                    return call;
                }

                return _assertThisInitialized(self);
            }
            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/object/get-prototype-of.js
            var get_prototype_of = __webpack_require__("jDdP");
            var get_prototype_of_default = /*#__PURE__*/ __webpack_require__.n(
                get_prototype_of
            );

            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/object/set-prototype-of.js
            var set_prototype_of = __webpack_require__("OKNm");
            var set_prototype_of_default = /*#__PURE__*/ __webpack_require__.n(
                set_prototype_of
            );

            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/getPrototypeOf.js

            function getPrototypeOf_getPrototypeOf(o) {
                getPrototypeOf_getPrototypeOf = set_prototype_of_default.a
                    ? get_prototype_of_default.a
                    : function _getPrototypeOf(o) {
                          return o.__proto__ || get_prototype_of_default()(o);
                      };
                return getPrototypeOf_getPrototypeOf(o);
            }
            // EXTERNAL MODULE: ../node_modules/@babel/runtime-corejs2/core-js/object/create.js
            var create = __webpack_require__("6Ndq");
            var create_default = /*#__PURE__*/ __webpack_require__.n(create);

            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/setPrototypeOf.js

            function _setPrototypeOf(o, p) {
                _setPrototypeOf =
                    set_prototype_of_default.a ||
                    function _setPrototypeOf(o, p) {
                        o.__proto__ = p;
                        return o;
                    };

                return _setPrototypeOf(o, p);
            }
            // CONCATENATED MODULE: ../node_modules/@babel/runtime-corejs2/helpers/esm/inherits.js

            function _inherits(subClass, superClass) {
                if (typeof superClass !== "function" && superClass !== null) {
                    throw new TypeError(
                        "Super expression must either be null or a function"
                    );
                }

                subClass.prototype = create_default()(
                    superClass && superClass.prototype,
                    {
                        constructor: {
                            value: subClass,
                            writable: true,
                            configurable: true
                        }
                    }
                );
                if (superClass) _setPrototypeOf(subClass, superClass);
            }
            // EXTERNAL MODULE: external "react"
            var external_react_ = __webpack_require__("cDcd");
            var external_react_default = /*#__PURE__*/ __webpack_require__.n(
                external_react_
            );

            // EXTERNAL MODULE: external "next-server/dynamic"
            var dynamic_ = __webpack_require__("LDx1");
            var dynamic_default = /*#__PURE__*/ __webpack_require__.n(dynamic_);

            // CONCATENATED MODULE: ./pages/index.tsx

            var HeaderSSR = dynamic_default()(
                function() {
                    return __webpack_require__
                        .e(/* import() */ 1)
                        .then(__webpack_require__.bind(null, "cB7a"));
                },
                {
                    ssr: true,
                    loadableGenerated: {
                        webpack: function webpack() {
                            return [/*require.resolve*/ "cB7a"];
                        },
                        modules: ["../src/header"]
                    }
                }
            );
            var HeaderNoSSR = dynamic_default()(
                function() {
                    return __webpack_require__
                        .e(/* import() */ 1)
                        .then(__webpack_require__.bind(null, "cB7a"));
                },
                {
                    ssr: false,
                    loadableGenerated: {
                        webpack: function webpack() {
                            return [/*require.resolve*/ "cB7a"];
                        },
                        modules: ["../src/header"]
                    }
                }
            );
            var FooterSSR = dynamic_default()(
                function() {
                    return __webpack_require__
                        .e(/* import() */ 0)
                        .then(__webpack_require__.bind(null, "Map4"));
                },
                {
                    ssr: true,
                    loadableGenerated: {
                        webpack: function webpack() {
                            return [/*require.resolve*/ "Map4"];
                        },
                        modules: ["../src/footer"]
                    }
                }
            );
            var FooterNoSSR = dynamic_default()(
                function() {
                    return __webpack_require__
                        .e(/* import() */ 0)
                        .then(__webpack_require__.bind(null, "Map4"));
                },
                {
                    ssr: false,
                    loadableGenerated: {
                        webpack: function webpack() {
                            return [/*require.resolve*/ "Map4"];
                        },
                        modules: ["../src/footer"]
                    }
                }
            );

            var pages_Home =
                /*#__PURE__*/
                (function(_React$Component) {
                    _inherits(Home, _React$Component);

                    function Home() {
                        _classCallCheck(this, Home);

                        return _possibleConstructorReturn(
                            this,
                            getPrototypeOf_getPrototypeOf(Home).apply(
                                this,
                                arguments
                            )
                        );
                    }

                    _createClass(
                        Home,
                        [
                            {
                                key: "render",
                                value: function render() {
                                    if (this.props.component === "header") {
                                        // const Header = header(this.props.render);
                                        return this.props.render
                                            ? external_react_default.a.createElement(
                                                  HeaderSSR,
                                                  null
                                              )
                                            : external_react_default.a.createElement(
                                                  HeaderNoSSR,
                                                  null
                                              );
                                    }

                                    if (this.props.component === "footer") {
                                        return this.props.render
                                            ? external_react_default.a.createElement(
                                                  FooterSSR,
                                                  null
                                              )
                                            : external_react_default.a.createElement(
                                                  FooterNoSSR,
                                                  null
                                              );
                                    }
                                }
                            }
                        ],
                        [
                            {
                                key: "getInitialProps",
                                value: (function() {
                                    var _getInitialProps = _asyncToGenerator(
                                        /*#__PURE__*/
                                        regenerator_default.a.mark(
                                            function _callee(ctx) {
                                                return regenerator_default.a.wrap(
                                                    function _callee$(
                                                        _context
                                                    ) {
                                                        while (1) {
                                                            switch (
                                                                (_context.prev =
                                                                    _context.next)
                                                            ) {
                                                                case 0:
                                                                    return _context.abrupt(
                                                                        "return",
                                                                        {
                                                                            component:
                                                                                ctx
                                                                                    .query
                                                                                    .component,
                                                                            render:
                                                                                ctx
                                                                                    .query
                                                                                    .render ===
                                                                                "true"
                                                                                    ? true
                                                                                    : false
                                                                        }
                                                                    );

                                                                case 1:
                                                                case "end":
                                                                    return _context.stop();
                                                            }
                                                        }
                                                    },
                                                    _callee,
                                                    this
                                                );
                                            }
                                        )
                                    );

                                    function getInitialProps(_x) {
                                        return _getInitialProps.apply(
                                            this,
                                            arguments
                                        );
                                    }

                                    return getInitialProps;
                                })()
                            }
                        ]
                    );

                    return Home;
                })(external_react_default.a.Component);

            /* harmony default export */ var pages = (__webpack_exports__[
                "default"
            ] = pages_Home);

            /***/
        },

        /***/ "6Ndq": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("o5io");

            /***/
        },

        /***/ LDx1: /***/ function(module, exports) {
            module.exports = require("next-server/dynamic");

            /***/
        },

        /***/ OKNm: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("Wk4r");

            /***/
        },

        /***/ TUA0: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/define-property");

            /***/
        },

        /***/ UrUy: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("cu1A");

            /***/
        },

        /***/ Wk4r: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/set-prototype-of");

            /***/
        },

        /***/ XzKa: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("vqFK");

            /***/
        },

        /***/ ZOIa: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("aC71");

            /***/
        },

        /***/ aC71: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/promise");

            /***/
        },

        /***/ cDcd: /***/ function(module, exports) {
            module.exports = require("react");

            /***/
        },

        /***/ cu1A: /***/ function(module, exports) {
            module.exports = require("regenerator-runtime");

            /***/
        },

        /***/ "gHn/": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol/iterator");

            /***/
        },

        /***/ hHgk: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("TUA0");

            /***/
        },

        /***/ jDdP: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("/+oN");

            /***/
        },

        /***/ o5io: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/create");

            /***/
        },

        /***/ "t+lh": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("gHn/");

            /***/
        },

        /***/ vqFK: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol");

            /***/
        }

        /******/
    }
);
