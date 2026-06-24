import { describe, it } from 'vitest';
import { PROPS, ROADS } from '../src/sim/data';

describe('identify props on roads', () => {
  it('lists props near the worst hit points', () => {
    const pts = [{x:10,z:12},{x:-7.7,z:667},{x:19.4,z:466},{x:-8,z:667}];
    const near = (x:number,z:number,r=8)=>Math.hypot;
    for (const p of pts) {
      console.log(`--- near (${p.x}, ${p.z}) ---`);
      for (const k of Object.keys(PROPS) as (keyof typeof PROPS)[]) {
        const arr:any = (PROPS as any)[k];
        if (!Array.isArray(arr)) continue;
        for (const o of arr) {
          let ox:number|undefined, oz:number|undefined;
          if (Array.isArray(o)) { ox=o[0]; oz=o[1]; }
          else if (typeof o==='object') { ox=o.x; oz=o.z; }
          if (ox==null||oz==null) continue;
          const d=Math.hypot(ox-p.x, oz-p.z);
          if (d<10) console.log(`  ${k} at (${ox.toFixed(1)},${oz.toFixed(1)}) d=${d.toFixed(1)} ${JSON.stringify(o).slice(0,90)}`);
        }
      }
    }
  });
});
