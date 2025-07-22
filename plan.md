please use Effect TS with great compile time checked types, we'll use vite for build tool

we want a simple FE tool for downtown seattle map, leaflet,

hi there! we are interested in building a simple mapping app

we'll have multiple phases but the first task is to have an open source map of seattle, downtown, and we'll have a path builder tool

we'll build complex paths step by step

we'll use the underlying Graph of nodes and edges and only allow paths to travel this Graph

i think a simple and nice feature is to build a complex path in stages

we'll click start and then click our first waypoint, we'll do a simple pathfinding from start to A, then we'll add our next waypoint and the pathfinding will go from A to B, etc, etc, until we've build up a complex path, we'll have a list of each segment that when clicked is highlighted

note, we'll be able to click and drag each segment for editing in case the pathfinding algo didnt go the exact route intended, importantly the edited path must snap to grid

for simplicity lets only allow editing on the current most recent segment as we build the complex path, so if im on segment B -> C, the previous segments are locked in and cannot be edited, the only way would be to delete and start from scratch, this way it is kept simple because if we edited previous semgnets we'd have to re-compute each segment after
