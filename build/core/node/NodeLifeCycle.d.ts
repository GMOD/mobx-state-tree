/**
 * @internal
 * @hidden
 */
export declare enum NodeLifeCycle {
    INITIALIZING = 0,// setting up
    CREATED = 1,// afterCreate has run
    FINALIZED = 2,// afterAttach has run
    DETACHING = 3,// being detached from the tree
    DEAD = 4
}
