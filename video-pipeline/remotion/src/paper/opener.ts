// Whether this scene is the first scene of a Short. Its first frame is the Short's picture in the feed, so a chart or
// a compare that opens a Short is posed on it: the title, the axes and every bar's outline and label, or both boxes
// with their headings and values, are there on frame 0 instead of being written on over the first seconds. What is
// said still lands when it is said (a bar's fill and figure on its number). Video.tsx sets it for that one scene
// (sb.short, the first in the list); everywhere else, and on every long video, it is false and nothing changes.
import React from 'react';

export const Opener = React.createContext(false);
