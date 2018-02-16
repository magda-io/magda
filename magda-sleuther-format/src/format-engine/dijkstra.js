/**
 * Basic Graph data structure implementation
 * using git gist: https://gist.github.com/skeep/6cdfa9de0a408b7af78ba496e90ea53a
 * @constructor
 */
var Graph = function() {
    this.vertices = {};
};

module.exports.Graph = Graph;

Graph.prototype.add = function(name, edges) {
    edges = edges || null;
    this.vertices[name] = edges;
};

exports.Graph.prototype.add = Graph.add;

Graph.prototype.length = function(u, v) {
    return (this.vertices[u][v]);
};

module.exports.Graph.prototype.length = Graph.length;

/**
 * Dijkstra's algorithm is an algorithm for finding the shortest paths between nodes in a graph
 * @param source
 * @returns {{}}
 */
Graph.prototype.Dijkstra = function(source) {
    // create vertex set Q
    var Q = {},
        dist = {},
        prev = {};

    /**
     * for each vertex v in Graph:             // Initialization
     *     dist[v] ← INFINITY                  // Unknown distance from source to v
     *     prev[v] ← UNDEFINED                 // Previous node in optimal path from source
     *     add v to Q                          // All nodes initially in Q (unvisited nodes)
     */
    for (var vertex in this.vertices) {
        dist[vertex] = Infinity;
        prev[vertex] = undefined;
        Q[vertex] = this.vertices[vertex];
    }

    // dist[source] ← 0  // Distance from source to source

    dist[source] = 0;

    // while Q is not empty:
    while (!_isEmpty(Q)) {
        // u ← vertex in Q with min dist[u]    // Source node will be selected first
        var u = _extractMin(Q, dist);

        // remove u from Q
        delete Q[u];

        // for each neighbor v of u:           // where v is still in Q.
        for (var neighbor in this.vertices[u]) {
            // alt ← dist[u] + length(u, v)
            var alt = dist[u] + G.length(u, neighbor);

            /**
             * if alt < dist[v]:               // A shorter path to v has been found
             *     dist[v] ← alt
             *     prev[v] ← u
             */
            if (alt < dist[neighbor]) {
                dist[neighbor] = alt;
                prev[neighbor] = u;
            }
        }
    }
    return dist;
};

module.exports.Dijkstra = Graph.Dijkstra;

// Usage
var G = new Graph();
G.add('S', { V: 1, W: 4 });
G.add('W', { T: 3 });
G.add('V', { W: 2, T: 6 });
G.add('T');

console.log(G.Dijkstra('S'));

/**
 * Just a utility method to check if an Object is empty or not
 * @param obj
 * @returns {boolean}
 * @private
 */
function _isEmpty(obj) {
    return Object.keys(obj).length === 0;
}

module.exports._isEmpty = _isEmpty;

/**
 * Extract the node with minimum distance from active vertex.
 * This should not be required if using a priority queue
 * @param Q
 * @param dist
 * @returns {*}
 * @private
 */
function _extractMin(Q, dist) {
    var minimumDistance = Infinity;
    var nodeWithMinimumDistance;

    for (var node in Q) {
        if (dist[node] <= minimumDistance) {
            minimumDistance = dist[node];
            nodeWithMinimumDistance = node;
        }
    }
    return nodeWithMinimumDistance;
}
