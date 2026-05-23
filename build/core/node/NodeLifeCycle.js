/**
 * @internal
 * @hidden
 */
export var NodeLifeCycle;
(function (NodeLifeCycle) {
    NodeLifeCycle[NodeLifeCycle["INITIALIZING"] = 0] = "INITIALIZING";
    NodeLifeCycle[NodeLifeCycle["CREATED"] = 1] = "CREATED";
    NodeLifeCycle[NodeLifeCycle["FINALIZED"] = 2] = "FINALIZED";
    NodeLifeCycle[NodeLifeCycle["DETACHING"] = 3] = "DETACHING";
    NodeLifeCycle[NodeLifeCycle["DEAD"] = 4] = "DEAD"; // no coming back from this one
})(NodeLifeCycle || (NodeLifeCycle = {}));
//# sourceMappingURL=NodeLifeCycle.js.map