# Tool coverage

| Family            | Available in this release                                  | Interaction                                                   |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| Lines             | Trend, forward ray, horizontal, vertical, parallel channel | Two anchors; one for H/V; three for channel                   |
| Shapes            | Rectangle/zone, ellipse                                    | Two corners; editable body/handles                            |
| Market phases     | Accumulation, Manipulation, Distribution                   | Named/color rectangle presets                                 |
| Positions         | Long and short drawings, green target/red stop, ratio      | Entry then protective stop creates 2R target; drag any anchor |
| Fibonacci         | Retracement 0/.236/.382/.5/.618/.786/1                     | Two swing endpoints                                           |
| Measurement       | Price change, percentage, duration                         | Two anchors                                                   |
| Annotations       | Text, arrow                                                | One point for text; two for arrow                             |
| Profile           | Estimated fixed-range volume profile, POC/VAH/VAL          | Recent-bar controls or drawn time range                       |
| Object management | Select, drag, label, color, hide, lock, delete, undo/redo  | Chart + Drawings panel                                        |

The long/short box is a planning drawing. Its ratio is geometric and excludes fees; it does not calculate broker margin or send an order.

Not yet implemented: Gann tools, pitchfork variants, Elliott-wave/pattern tools, anchored VWAP, Fibonacci extensions/fans/arcs/time zones, multi-chart synchronization, actual tick-level footprint/delta/DOM, arbitrary script execution and Pine Script. These are roadmap items, not hidden or paid features. There is no proprietary TradingView drawing engine inside this app.

## Study editor

The JSON editor saves combinations of the eight tested built-in indicators. It validates version, name and boolean indicator settings, then stores a local preset. No imported code executes. A future typed plugin API should retain explicit data access, resource limits and compatibility/version checks.
