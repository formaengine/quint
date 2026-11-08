module nested_any {
  var x: int
  action init = x' = 0
  action Plain = { nondet v = Set(1, 2).oneOf() all { x' = x + v } }
  action Nested = all { any { x >= 0, x < 0 }, x' = x + 10 }
  action step = any { Plain, Nested }
}
