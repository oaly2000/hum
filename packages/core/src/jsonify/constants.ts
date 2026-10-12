/**
 * Sentinel values used by the Hum serialization protocol. Negative numbers
 * cannot collide with real slot indexes, because slot indexes are always
 * greater than or equal to zero.
 */
export const UNDEFINED = -1;
export const NULL = -2;
export const NAN = -3;
export const INFINITY_POS = -4;
export const INFINITY_NEG = -5;
export const ZERO_NEG = -6;
export const HOLE = -7;
