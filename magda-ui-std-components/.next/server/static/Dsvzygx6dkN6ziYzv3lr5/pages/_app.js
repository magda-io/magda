module.exports = /******/ (function(modules) {
    // webpackBootstrap
    /******/ // The module cache
    /******/ var installedModules = require("../../../ssr-module-cache.js"); // The require function
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
    } // expose the modules object (__webpack_modules__)
    /******/
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
    /******/ /******/ __webpack_require__.p = ""; // Load entry module and return exports
    /******/
    /******/
    /******/ /******/ return __webpack_require__((__webpack_require__.s = 1));
    /******/
})(
    /************************************************************************/
    /******/ {
        /***/ "/+oN": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/get-prototype-of");

            /***/
        },

        /***/ 1: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("gU5P");

            /***/
        },

        /***/ "3qLq": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("UXPh");

            /***/
        },

        /***/ "6/ac": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("cu1A");

            /***/
        },

        /***/ "71Dw": /***/ function(module, exports, __webpack_require__) {
            var _Promise = __webpack_require__("yWKQ");

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
                    _Promise.resolve(value).then(_next, _throw);
                }
            }

            function _asyncToGenerator(fn) {
                return function() {
                    var self = this,
                        args = arguments;
                    return new _Promise(function(resolve, reject) {
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

            module.exports = _asyncToGenerator;

            /***/
        },

        /***/ "8TPf": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("aAV7");

            /***/
        },

        /***/ "8WHb": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("dGr4");

            /***/
        },

        /***/ G8SI: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("gHn/");

            /***/
        },

        /***/ GUE2: /***/ function(module, exports) {
            function _classCallCheck(instance, Constructor) {
                if (!(instance instanceof Constructor)) {
                    throw new TypeError("Cannot call a class as a function");
                }
            }

            module.exports = _classCallCheck;

            /***/
        },

        /***/ IJGv: /***/ function(module, exports) {
            function _interopRequireDefault(obj) {
                return obj && obj.__esModule
                    ? obj
                    : {
                          default: obj
                      };
            }

            module.exports = _interopRequireDefault;

            /***/
        },

        /***/ "M/EP": /***/ function(module, exports, __webpack_require__) {
            var _Symbol$iterator = __webpack_require__("G8SI");

            var _Symbol = __webpack_require__("SI4Z");

            function _typeof2(obj) {
                if (
                    typeof _Symbol === "function" &&
                    typeof _Symbol$iterator === "symbol"
                ) {
                    _typeof2 = function _typeof2(obj) {
                        return typeof obj;
                    };
                } else {
                    _typeof2 = function _typeof2(obj) {
                        return obj &&
                            typeof _Symbol === "function" &&
                            obj.constructor === _Symbol &&
                            obj !== _Symbol.prototype
                            ? "symbol"
                            : typeof obj;
                    };
                }
                return _typeof2(obj);
            }

            function _typeof(obj) {
                if (
                    typeof _Symbol === "function" &&
                    _typeof2(_Symbol$iterator) === "symbol"
                ) {
                    module.exports = _typeof = function _typeof(obj) {
                        return _typeof2(obj);
                    };
                } else {
                    module.exports = _typeof = function _typeof(obj) {
                        return obj &&
                            typeof _Symbol === "function" &&
                            obj.constructor === _Symbol &&
                            obj !== _Symbol.prototype
                            ? "symbol"
                            : _typeof2(obj);
                    };
                }

                return _typeof(obj);
            }

            module.exports = _typeof;

            /***/
        },

        /***/ O9yA: /***/ function(module, exports, __webpack_require__) {
            "use strict";

            /**
             * Copyright 2015, Yahoo! Inc.
             * Copyrights licensed under the New BSD License. See the accompanying LICENSE file for terms.
             */
            var ReactIs = __webpack_require__("UWCm");
            var REACT_STATICS = {
                childContextTypes: true,
                contextType: true,
                contextTypes: true,
                defaultProps: true,
                displayName: true,
                getDefaultProps: true,
                getDerivedStateFromError: true,
                getDerivedStateFromProps: true,
                mixins: true,
                propTypes: true,
                type: true
            };

            var KNOWN_STATICS = {
                name: true,
                length: true,
                prototype: true,
                caller: true,
                callee: true,
                arguments: true,
                arity: true
            };

            var FORWARD_REF_STATICS = {
                $$typeof: true,
                render: true
            };

            var TYPE_STATICS = {};
            TYPE_STATICS[ReactIs.ForwardRef] = FORWARD_REF_STATICS;

            var defineProperty = Object.defineProperty;
            var getOwnPropertyNames = Object.getOwnPropertyNames;
            var getOwnPropertySymbols = Object.getOwnPropertySymbols;
            var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
            var getPrototypeOf = Object.getPrototypeOf;
            var objectPrototype = Object.prototype;

            function hoistNonReactStatics(
                targetComponent,
                sourceComponent,
                blacklist
            ) {
                if (typeof sourceComponent !== "string") {
                    // don't hoist over string (html) components

                    if (objectPrototype) {
                        var inheritedComponent = getPrototypeOf(
                            sourceComponent
                        );
                        if (
                            inheritedComponent &&
                            inheritedComponent !== objectPrototype
                        ) {
                            hoistNonReactStatics(
                                targetComponent,
                                inheritedComponent,
                                blacklist
                            );
                        }
                    }

                    var keys = getOwnPropertyNames(sourceComponent);

                    if (getOwnPropertySymbols) {
                        keys = keys.concat(
                            getOwnPropertySymbols(sourceComponent)
                        );
                    }

                    var targetStatics =
                        TYPE_STATICS[targetComponent["$$typeof"]] ||
                        REACT_STATICS;
                    var sourceStatics =
                        TYPE_STATICS[sourceComponent["$$typeof"]] ||
                        REACT_STATICS;

                    for (var i = 0; i < keys.length; ++i) {
                        var key = keys[i];
                        if (
                            !KNOWN_STATICS[key] &&
                            !(blacklist && blacklist[key]) &&
                            !(sourceStatics && sourceStatics[key]) &&
                            !(targetStatics && targetStatics[key])
                        ) {
                            var descriptor = getOwnPropertyDescriptor(
                                sourceComponent,
                                key
                            );
                            try {
                                // Avoid failures from read-only properties
                                defineProperty(
                                    targetComponent,
                                    key,
                                    descriptor
                                );
                            } catch (e) {}
                        }
                    }

                    return targetComponent;
                }

                return targetComponent;
            }

            module.exports = hoistNonReactStatics;

            /***/
        },

        /***/ Pnez: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("TUA0");

            /***/
        },

        /***/ SI4Z: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("vqFK");

            /***/
        },

        /***/ TUA0: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/define-property");

            /***/
        },

        /***/ Tnrh: /***/ function(module, exports, __webpack_require__) {
            var _Reflect$construct = __webpack_require__("8TPf");

            var setPrototypeOf = __webpack_require__("bsjJ");

            function isNativeReflectConstruct() {
                if (typeof Reflect === "undefined" || !_Reflect$construct)
                    return false;
                if (_Reflect$construct.sham) return false;
                if (typeof Proxy === "function") return true;

                try {
                    Date.prototype.toString.call(
                        _Reflect$construct(Date, [], function() {})
                    );
                    return true;
                } catch (e) {
                    return false;
                }
            }

            function _construct(Parent, args, Class) {
                if (isNativeReflectConstruct()) {
                    module.exports = _construct = _Reflect$construct;
                } else {
                    module.exports = _construct = function _construct(
                        Parent,
                        args,
                        Class
                    ) {
                        var a = [null];
                        a.push.apply(a, args);
                        var Constructor = Function.bind.apply(Parent, a);
                        var instance = new Constructor();
                        if (Class) setPrototypeOf(instance, Class.prototype);
                        return instance;
                    };
                }

                return _construct.apply(null, arguments);
            }

            module.exports = _construct;

            /***/
        },

        /***/ U51Q: /***/ function(module, exports, __webpack_require__) {
            "use strict";

            var _interopRequireDefault = __webpack_require__("IJGv");

            var _assign = _interopRequireDefault(__webpack_require__("8WHb"));

            var _classCallCheck2 = _interopRequireDefault(
                __webpack_require__("GUE2")
            );

            var _createClass2 = _interopRequireDefault(
                __webpack_require__("aPDU")
            );

            var _possibleConstructorReturn2 = _interopRequireDefault(
                __webpack_require__("if0H")
            );

            var _getPrototypeOf2 = _interopRequireDefault(
                __webpack_require__("hHLE")
            );

            var _inherits2 = _interopRequireDefault(
                __webpack_require__("XMn/")
            );

            var __importStar =
                (void 0 && (void 0).__importStar) ||
                function(mod) {
                    if (mod && mod.__esModule) return mod;
                    var result = {};
                    if (mod != null)
                        for (var k in mod) {
                            if (Object.hasOwnProperty.call(mod, k))
                                result[k] = mod[k];
                        }
                    result["default"] = mod;
                    return result;
                };

            var __importDefault =
                (void 0 && (void 0).__importDefault) ||
                function(mod) {
                    return mod && mod.__esModule
                        ? mod
                        : {
                              default: mod
                          };
                };

            Object.defineProperty(exports, "__esModule", {
                value: true
            });

            var react_1 = __importStar(__webpack_require__("cDcd"));

            var prop_types_1 = __importDefault(__webpack_require__("rf6O"));

            var hoist_non_react_statics_1 = __importDefault(
                __webpack_require__("O9yA")
            );

            var utils_1 = __webpack_require__("p8BD");

            function withRouter(ComposedComponent) {
                var displayName = utils_1.getDisplayName(ComposedComponent);

                var WithRouteWrapper =
                    /*#__PURE__*/
                    (function(_react_1$Component) {
                        (0, _inherits2.default)(
                            WithRouteWrapper,
                            _react_1$Component
                        );

                        function WithRouteWrapper() {
                            (0, _classCallCheck2.default)(
                                this,
                                WithRouteWrapper
                            );
                            return (0, _possibleConstructorReturn2.default)(
                                this,
                                (0, _getPrototypeOf2.default)(
                                    WithRouteWrapper
                                ).apply(this, arguments)
                            );
                        }

                        (0, _createClass2.default)(WithRouteWrapper, [
                            {
                                key: "render",
                                value: function render() {
                                    return react_1.default.createElement(
                                        ComposedComponent,
                                        (0, _assign.default)(
                                            {
                                                router: this.context.router
                                            },
                                            this.props
                                        )
                                    );
                                }
                            }
                        ]);
                        return WithRouteWrapper;
                    })(react_1.Component);

                WithRouteWrapper.contextTypes = {
                    router: prop_types_1.default.object
                };
                WithRouteWrapper.displayName = "withRouter(".concat(
                    displayName,
                    ")"
                );
                return hoist_non_react_statics_1.default(
                    WithRouteWrapper,
                    ComposedComponent
                );
            }

            exports.default = withRouter;

            /***/
        },

        /***/ UWCm: /***/ function(module, exports) {
            module.exports = require("react-is");

            /***/
        },

        /***/ UXPh: /***/ function(module, exports, __webpack_require__) {
            "use strict";

            var _interopRequireDefault = __webpack_require__("IJGv");

            var _assign = _interopRequireDefault(__webpack_require__("8WHb"));

            var _typeof2 = _interopRequireDefault(__webpack_require__("M/EP"));

            var _construct2 = _interopRequireDefault(
                __webpack_require__("Tnrh")
            );

            var _defineProperty = _interopRequireDefault(
                __webpack_require__("Pnez")
            );

            var __importDefault =
                (void 0 && (void 0).__importDefault) ||
                function(mod) {
                    return mod && mod.__esModule
                        ? mod
                        : {
                              default: mod
                          };
                };

            Object.defineProperty(exports, "__esModule", {
                value: true
            });
            /* global window */

            var router_1 = __importDefault(__webpack_require__("qxCs"));

            var SingletonRouter = {
                router: null,
                readyCallbacks: [],
                ready: function ready(cb) {
                    if (this.router) return cb();

                    if (typeof window !== "undefined") {
                        this.readyCallbacks.push(cb);
                    }
                }
            }; // Create public properties and methods of the router in the SingletonRouter

            var urlPropertyFields = ["pathname", "route", "query", "asPath"];
            var propertyFields = ["components"];
            var routerEvents = [
                "routeChangeStart",
                "beforeHistoryChange",
                "routeChangeComplete",
                "routeChangeError",
                "hashChangeStart",
                "hashChangeComplete"
            ];
            var coreMethodFields = [
                "push",
                "replace",
                "reload",
                "back",
                "prefetch",
                "beforePopState"
            ]; // Events is a static property on the router, the router doesn't have to be initialized to use it

            Object.defineProperty(SingletonRouter, "events", {
                get: function get() {
                    return router_1.default.events;
                }
            });
            propertyFields.concat(urlPropertyFields).forEach(function(field) {
                // Here we need to use Object.defineProperty because, we need to return
                // the property assigned to the actual router
                // The value might get changed as we change routes and this is the
                // proper way to access it
                (0, _defineProperty.default)(SingletonRouter, field, {
                    get: function get() {
                        throwIfNoRouter();
                        return SingletonRouter.router[field];
                    }
                });
            });
            coreMethodFields.forEach(function(field) {
                SingletonRouter[field] = function() {
                    var _SingletonRouter$rout;

                    throwIfNoRouter();
                    return (_SingletonRouter$rout = SingletonRouter.router)[
                        field
                    ].apply(_SingletonRouter$rout, arguments);
                };
            });
            routerEvents.forEach(function(event) {
                SingletonRouter.ready(function() {
                    router_1.default.events.on(event, function() {
                        var eventField = "on"
                            .concat(event.charAt(0).toUpperCase())
                            .concat(event.substring(1));

                        if (SingletonRouter[eventField]) {
                            try {
                                SingletonRouter[eventField].apply(
                                    SingletonRouter,
                                    arguments
                                );
                            } catch (err) {
                                console.error(
                                    "Error when running the Router event: ".concat(
                                        eventField
                                    )
                                );
                                console.error(
                                    ""
                                        .concat(err.message, "\n")
                                        .concat(err.stack)
                                );
                            }
                        }
                    });
                });
            });

            function throwIfNoRouter() {
                if (!SingletonRouter.router) {
                    var message =
                        "No router instance found.\n" +
                        'You should only use "next/router" inside the client side of your app.\n';
                    throw new Error(message);
                }
            } // Export the SingletonRouter and this is the public API.

            exports.default = SingletonRouter; // Reexport the withRoute HOC

            var with_router_1 = __webpack_require__("U51Q");

            exports.withRouter = with_router_1.default; // INTERNAL APIS
            // -------------
            // (do not use following exports inside the app)
            // Create a router and assign it as the singleton instance.
            // This is used in client side when we are initilizing the app.
            // This should **not** use inside the server.

            exports.createRouter = function() {
                for (
                    var _len = arguments.length,
                        args = new Array(_len),
                        _key = 0;
                    _key < _len;
                    _key++
                ) {
                    args[_key] = arguments[_key];
                }

                SingletonRouter.router = (0, _construct2.default)(
                    router_1.default,
                    args
                );
                SingletonRouter.readyCallbacks.forEach(function(cb) {
                    return cb();
                });
                SingletonRouter.readyCallbacks = [];
                return SingletonRouter.router;
            }; // Export the actual Router class, which is usually used inside the server

            exports.Router = router_1.default; // This function is used to create the `withRouter` router instance

            function makePublicRouterInstance(router) {
                var instance = {};

                for (var _i = 0; _i < urlPropertyFields.length; _i++) {
                    var property = urlPropertyFields[_i];

                    if ((0, _typeof2.default)(router[property]) === "object") {
                        instance[property] = (0, _assign.default)(
                            {},
                            router[property]
                        ); // makes sure query is not stateful

                        continue;
                    }

                    instance[property] = router[property];
                } // Events is a static property on the router, the router doesn't have to be initialized to use it

                instance.events = router_1.default.events;
                propertyFields.forEach(function(field) {
                    // Here we need to use Object.defineProperty because, we need to return
                    // the property assigned to the actual router
                    // The value might get changed as we change routes and this is the
                    // proper way to access it
                    (0, _defineProperty.default)(instance, field, {
                        get: function get() {
                            return router[field];
                        }
                    });
                });
                coreMethodFields.forEach(function(field) {
                    instance[field] = function() {
                        return router[field].apply(router, arguments);
                    };
                });
                return instance;
            }

            exports.makePublicRouterInstance = makePublicRouterInstance;

            /***/
        },

        /***/ Wk4r: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/set-prototype-of");

            /***/
        },

        /***/ "XMn/": /***/ function(module, exports, __webpack_require__) {
            var _Object$create = __webpack_require__("XYqc");

            var setPrototypeOf = __webpack_require__("bsjJ");

            function _inherits(subClass, superClass) {
                if (typeof superClass !== "function" && superClass !== null) {
                    throw new TypeError(
                        "Super expression must either be null or a function"
                    );
                }

                subClass.prototype = _Object$create(
                    superClass && superClass.prototype,
                    {
                        constructor: {
                            value: subClass,
                            writable: true,
                            configurable: true
                        }
                    }
                );
                if (superClass) setPrototypeOf(subClass, superClass);
            }

            module.exports = _inherits;

            /***/
        },

        /***/ XYqc: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("o5io");

            /***/
        },

        /***/ aAV7: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/reflect/construct");

            /***/
        },

        /***/ aC71: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/promise");

            /***/
        },

        /***/ aPDU: /***/ function(module, exports, __webpack_require__) {
            var _Object$defineProperty = __webpack_require__("Pnez");

            function _defineProperties(target, props) {
                for (var i = 0; i < props.length; i++) {
                    var descriptor = props[i];
                    descriptor.enumerable = descriptor.enumerable || false;
                    descriptor.configurable = true;
                    if ("value" in descriptor) descriptor.writable = true;

                    _Object$defineProperty(target, descriptor.key, descriptor);
                }
            }

            function _createClass(Constructor, protoProps, staticProps) {
                if (protoProps)
                    _defineProperties(Constructor.prototype, protoProps);
                if (staticProps) _defineProperties(Constructor, staticProps);
                return Constructor;
            }

            module.exports = _createClass;

            /***/
        },

        /***/ bsjJ: /***/ function(module, exports, __webpack_require__) {
            var _Object$setPrototypeOf = __webpack_require__("vzQs");

            function _setPrototypeOf(o, p) {
                module.exports = _setPrototypeOf =
                    _Object$setPrototypeOf ||
                    function _setPrototypeOf(o, p) {
                        o.__proto__ = p;
                        return o;
                    };

                return _setPrototypeOf(o, p);
            }

            module.exports = _setPrototypeOf;

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

        /***/ dGr4: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/assign");

            /***/
        },

        /***/ "gHn/": /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol/iterator");

            /***/
        },

        /***/ gU5P: /***/ function(module, exports, __webpack_require__) {
            "use strict";

            var _interopRequireDefault = __webpack_require__("IJGv");

            var _regenerator = _interopRequireDefault(
                __webpack_require__("6/ac")
            );

            var _asyncToGenerator2 = _interopRequireDefault(
                __webpack_require__("71Dw")
            );

            var _assign = _interopRequireDefault(__webpack_require__("8WHb"));

            var _classCallCheck2 = _interopRequireDefault(
                __webpack_require__("GUE2")
            );

            var _createClass2 = _interopRequireDefault(
                __webpack_require__("aPDU")
            );

            var _possibleConstructorReturn2 = _interopRequireDefault(
                __webpack_require__("if0H")
            );

            var _getPrototypeOf2 = _interopRequireDefault(
                __webpack_require__("hHLE")
            );

            var _inherits2 = _interopRequireDefault(
                __webpack_require__("XMn/")
            );

            var __importStar =
                (void 0 && (void 0).__importStar) ||
                function(mod) {
                    if (mod && mod.__esModule) return mod;
                    var result = {};
                    if (mod != null)
                        for (var k in mod) {
                            if (Object.hasOwnProperty.call(mod, k))
                                result[k] = mod[k];
                        }
                    result["default"] = mod;
                    return result;
                };

            var __importDefault =
                (void 0 && (void 0).__importDefault) ||
                function(mod) {
                    return mod && mod.__esModule
                        ? mod
                        : {
                              default: mod
                          };
                };

            Object.defineProperty(exports, "__esModule", {
                value: true
            });

            var react_1 = __importStar(__webpack_require__("cDcd"));

            var prop_types_1 = __importDefault(__webpack_require__("rf6O"));

            var utils_1 = __webpack_require__("p8BD");

            var router_1 = __webpack_require__("3qLq");

            var App =
                /*#__PURE__*/
                (function(_react_1$Component) {
                    (0, _inherits2.default)(App, _react_1$Component);

                    function App() {
                        (0, _classCallCheck2.default)(this, App);
                        return (0, _possibleConstructorReturn2.default)(
                            this,
                            (0, _getPrototypeOf2.default)(App).apply(
                                this,
                                arguments
                            )
                        );
                    }

                    (0, _createClass2.default)(
                        App,
                        [
                            {
                                key: "getChildContext",
                                value: function getChildContext() {
                                    return {
                                        router: router_1.makePublicRouterInstance(
                                            this.props.router
                                        )
                                    };
                                } // Kept here for backwards compatibility.
                                // When someone ended App they could call `super.componentDidCatch`. This is now deprecated.
                            },
                            {
                                key: "componentDidCatch",
                                value: function componentDidCatch(err) {
                                    throw err;
                                }
                            },
                            {
                                key: "render",
                                value: function render() {
                                    var _this$props = this.props,
                                        router = _this$props.router,
                                        Component = _this$props.Component,
                                        pageProps = _this$props.pageProps;
                                    var url = createUrl(router);
                                    return react_1.default.createElement(
                                        Container,
                                        null,
                                        react_1.default.createElement(
                                            Component,
                                            (0, _assign.default)(
                                                {},
                                                pageProps,
                                                {
                                                    url: url
                                                }
                                            )
                                        )
                                    );
                                }
                            }
                        ],
                        [
                            {
                                key: "getInitialProps",
                                value: (function() {
                                    var _getInitialProps = (0,
                                    _asyncToGenerator2.default)(
                                        /*#__PURE__*/
                                        _regenerator.default.mark(
                                            function _callee(_ref) {
                                                var Component,
                                                    router,
                                                    ctx,
                                                    pageProps;
                                                return _regenerator.default.wrap(
                                                    function _callee$(
                                                        _context
                                                    ) {
                                                        while (1) {
                                                            switch (
                                                                (_context.prev =
                                                                    _context.next)
                                                            ) {
                                                                case 0:
                                                                    (Component =
                                                                        _ref.Component),
                                                                        (router =
                                                                            _ref.router),
                                                                        (ctx =
                                                                            _ref.ctx);
                                                                    _context.next = 3;
                                                                    return utils_1.loadGetInitialProps(
                                                                        Component,
                                                                        ctx
                                                                    );

                                                                case 3:
                                                                    pageProps =
                                                                        _context.sent;
                                                                    return _context.abrupt(
                                                                        "return",
                                                                        {
                                                                            pageProps: pageProps
                                                                        }
                                                                    );

                                                                case 5:
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
                    return App;
                })(react_1.Component);

            App.childContextTypes = {
                router: prop_types_1.default.object
            };
            exports.default = App;

            var Container =
                /*#__PURE__*/
                (function(_react_1$Component2) {
                    (0, _inherits2.default)(Container, _react_1$Component2);

                    function Container() {
                        (0, _classCallCheck2.default)(this, Container);
                        return (0, _possibleConstructorReturn2.default)(
                            this,
                            (0, _getPrototypeOf2.default)(Container).apply(
                                this,
                                arguments
                            )
                        );
                    }

                    (0, _createClass2.default)(Container, [
                        {
                            key: "componentDidMount",
                            value: function componentDidMount() {
                                this.scrollToHash();
                            }
                        },
                        {
                            key: "componentDidUpdate",
                            value: function componentDidUpdate() {
                                this.scrollToHash();
                            }
                        },
                        {
                            key: "scrollToHash",
                            value: function scrollToHash() {
                                var hash = window.location.hash;
                                hash = hash ? hash.substring(1) : false;
                                if (!hash) return;
                                var el = document.getElementById(hash);
                                if (!el) return; // If we call scrollIntoView() in here without a setTimeout
                                // it won't scroll properly.

                                setTimeout(function() {
                                    return el.scrollIntoView();
                                }, 0);
                            }
                        },
                        {
                            key: "render",
                            value: function render() {
                                return this.props.children;
                            }
                        }
                    ]);
                    return Container;
                })(react_1.Component);

            exports.Container = Container;
            var warnUrl = utils_1.execOnce(function() {
                if (false) {
                }
            });

            function createUrl(router) {
                // This is to make sure we don't references the router object at call time
                var pathname = router.pathname,
                    asPath = router.asPath,
                    query = router.query;
                return {
                    get query() {
                        warnUrl();
                        return query;
                    },

                    get pathname() {
                        warnUrl();
                        return pathname;
                    },

                    get asPath() {
                        warnUrl();
                        return asPath;
                    },

                    back: function back() {
                        warnUrl();
                        router.back();
                    },
                    push: function push(url, as) {
                        warnUrl();
                        return router.push(url, as);
                    },
                    pushTo: function pushTo(href, as) {
                        warnUrl();
                        var pushRoute = as ? href : null;
                        var pushUrl = as || href;
                        return router.push(pushRoute, pushUrl);
                    },
                    replace: function replace(url, as) {
                        warnUrl();
                        return router.replace(url, as);
                    },
                    replaceTo: function replaceTo(href, as) {
                        warnUrl();
                        var replaceRoute = as ? href : null;
                        var replaceUrl = as || href;
                        return router.replace(replaceRoute, replaceUrl);
                    }
                };
            }

            exports.createUrl = createUrl;

            /***/
        },

        /***/ hHLE: /***/ function(module, exports, __webpack_require__) {
            var _Object$getPrototypeOf = __webpack_require__("o+sT");

            var _Object$setPrototypeOf = __webpack_require__("vzQs");

            function _getPrototypeOf(o) {
                module.exports = _getPrototypeOf = _Object$setPrototypeOf
                    ? _Object$getPrototypeOf
                    : function _getPrototypeOf(o) {
                          return o.__proto__ || _Object$getPrototypeOf(o);
                      };
                return _getPrototypeOf(o);
            }

            module.exports = _getPrototypeOf;

            /***/
        },

        /***/ if0H: /***/ function(module, exports, __webpack_require__) {
            var _typeof = __webpack_require__("M/EP");

            var assertThisInitialized = __webpack_require__("v2ln");

            function _possibleConstructorReturn(self, call) {
                if (
                    call &&
                    (_typeof(call) === "object" || typeof call === "function")
                ) {
                    return call;
                }

                return assertThisInitialized(self);
            }

            module.exports = _possibleConstructorReturn;

            /***/
        },

        /***/ "o+sT": /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("/+oN");

            /***/
        },

        /***/ o5io: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/object/create");

            /***/
        },

        /***/ p8BD: /***/ function(module, exports) {
            module.exports = require("next-server/dist/lib/utils");

            /***/
        },

        /***/ qxCs: /***/ function(module, exports) {
            module.exports = require("next-server/dist/lib/router/router");

            /***/
        },

        /***/ rf6O: /***/ function(module, exports) {
            module.exports = require("prop-types");

            /***/
        },

        /***/ v2ln: /***/ function(module, exports) {
            function _assertThisInitialized(self) {
                if (self === void 0) {
                    throw new ReferenceError(
                        "this hasn't been initialised - super() hasn't been called"
                    );
                }

                return self;
            }

            module.exports = _assertThisInitialized;

            /***/
        },

        /***/ vqFK: /***/ function(module, exports) {
            module.exports = require("core-js/library/fn/symbol");

            /***/
        },

        /***/ vzQs: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("Wk4r");

            /***/
        },

        /***/ yWKQ: /***/ function(module, exports, __webpack_require__) {
            module.exports = __webpack_require__("aC71");

            /***/
        }

        /******/
    }
);
