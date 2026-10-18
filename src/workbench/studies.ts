import { PineWorkerEngine } from '@luxalgo/vela-pinets';
export const STUDIES = [
  {
    name: 'Three EMAs',
    language: 'pine',
    enabled: true,
    script: `//@version=6
indicator("Three EMAs", overlay=true)
fast=input.int(9,"Fast EMA",minval=1,maxval=2000)
medium=input.int(21,"Medium EMA",minval=1,maxval=2000)
slow=input.int(200,"Slow EMA",minval=1,maxval=2000)
fastColor=input.color(color.blue,"Fast color")
mediumColor=input.color(color.yellow,"Medium color")
slowColor=input.color(color.red,"Slow color")
width=input.int(2,"Line width",minval=1,maxval=4)
plot(ta.ema(close,fast),"Fast EMA",color=fastColor,linewidth=width)
plot(ta.ema(close,medium),"Medium EMA",color=mediumColor,linewidth=width)
plot(ta.ema(close,slow),"Slow EMA",color=slowColor,linewidth=width)`,
  },
  {
    name: 'RSI',
    language: 'pine',
    enabled: true,
    script: `//@version=6
indicator("RSI",overlay=false)
period=input.int(14,"Period",minval=1,maxval=2000)
upper=input.float(70,"Upper reference",minval=0,maxval=100)
lower=input.float(30,"Lower reference",minval=0,maxval=100)
lineColor=input.color(color.purple,"Line color")
plot(ta.rsi(close,period),"RSI",color=lineColor)
hline(upper,"Upper")
hline(lower,"Lower")`,
  },
  {
    name: 'MACD',
    language: 'pine',
    enabled: true,
    script: `//@version=6
indicator("MACD",overlay=false)
fast=input.int(12,"Fast",minval=1,maxval=2000)
slow=input.int(26,"Slow",minval=1,maxval=2000)
signal=input.int(9,"Signal",minval=1,maxval=2000)
lineColor=input.color(color.blue,"MACD color")
signalColor=input.color(color.orange,"Signal color")
positive=input.color(color.green,"Positive histogram")
negative=input.color(color.red,"Negative histogram")
[m,s,h]=ta.macd(close,fast,slow,signal)
plot(m,"MACD",color=lineColor)
plot(s,"Signal",color=signalColor)
plot(h,"Histogram",style=plot.style_histogram,color=h>=0?positive:negative)`,
  },
];
const allowed = new Set(STUDIES.map((s) => s.script));
/** Only audited bundled sources for now. Saved layouts cannot inject arbitrary executable code. */
export class BundledStudyEngine extends PineWorkerEngine {
  prepare(source: string, id: string) {
    if (!allowed.has(source))
      return Promise.reject(
        new Error(
          'Custom Pine source is not enabled yet. Select a bundled study or a built-in indicator.'
        )
      );
    return super.prepare(source, id);
  }
}
