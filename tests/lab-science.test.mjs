import test from 'node:test';import assert from 'node:assert/strict';
import {calculateGasPressure,calculateGasAverageKE,calculateGasRMS,strongMixturePH,titrationPH,reactionEnergy} from '../frontend/src/features/chemistry-lab/science.ts';
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
test('理想气体单位、定温反比、定容正比和动能',()=>{
 const p=calculateGasPressure(.1,8.314,300,.005);close(p,49884);
 close(calculateGasPressure(.1,8.314,300,.010),p/2);close(calculateGasPressure(.1,8.314,600,.005),p*2);
 close(calculateGasAverageKE(600),calculateGasAverageKE(300)*2);close(calculateGasRMS(600,.029)/calculateGasRMS(300,.029),Math.sqrt(2));
});
test('等量中和与酸碱过量，不无条件变成pH7',()=>{close(strongMixturePH(.0025,.0025,.05),7);assert.ok(strongMixturePH(.005,.0025,.05)<2);assert.ok(strongMixturePH(.0025,.005,.05)>12)});
test('盐酸滴定初始、当量、过量及连续性',()=>{close(titrationPH(0,25,.1,.1,'HCl'),1,1e-8);close(titrationPH(25,25,.1,.1,'HCl'),7);assert.ok(titrationPH(30,25,.1,.1,'HCl')>11);assert.ok(titrationPH(24.99999,25,.1,.1,'HCl')<titrationPH(25.00001,25,.1,.1,'HCl'))});
test('乙酸滴定初始、半当量、当量碱性与过量，曲线单调',()=>{
 close(titrationPH(0,25,.1,.1,'CH3COOH'),2.875,0.01);close(titrationPH(12.5,25,.1,.1,'CH3COOH'),4.745,0.02);close(titrationPH(25,25,.1,.1,'CH3COOH'),8.72,0.02);
 let previous=-Infinity;for(let volume=0;volume<=50;volume+=.25){const ph=titrationPH(volume,25,.1,.1,'CH3COOH');assert.ok(ph>=previous);previous=ph}
});

test('放热吸热端点、共同过渡态与剖面连续',()=>{for(const delta of [-30,30]){close(reactionEnergy(0,40,delta),80);close(reactionEnergy(.5,40,delta),120);close(reactionEnergy(1,40,delta),80+delta);assert.ok(Math.abs(reactionEnergy(.499999,40,delta)-reactionEnergy(.500001,40,delta))<1e-5)}});
