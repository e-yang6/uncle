import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../sim/engine.js';
import { rangeChart } from './chart-ranges.js';
import { placeholderKeys } from '../voice/chat.js';

test('central chart intervals use simulation quartiles without exposing or changing spoken facts',()=>{
  const facts=simulate({age:21},{numLives:500});
  const saved=JSON.stringify(facts);
  const chart=rangeChart('Age',['Life expectancy','Healthy years'],[[facts,'life_expectancy'],[facts,'healthy_years']]);
  assert.equal(chart.coverage,.5);
  for(const [i,key] of ['life_expectancy','healthy_years'].entries()){
    assert.equal(chart.datasets[0].data[i],facts.chartRanges[key].low);
    assert.equal(chart.datasets[2].data[i],facts.chartRanges[key].high);
    assert.ok(facts[key].low<=facts.chartRanges[key].low);
    assert.ok(facts.chartRanges[key].low<=facts[key].median);
    assert.ok(facts[key].median<=facts.chartRanges[key].high);
    assert.ok(facts.chartRanges[key].high<=facts[key].high);
  }
  assert.equal(JSON.stringify(facts),saved);
  assert.ok(!saved.includes('chartRanges'));
  assert.ok(!placeholderKeys(facts).some(key=>key.includes('chartRanges')));
});

test('legacy facts retain the correctly labelled 80 percent interval without guessed quartiles',()=>{
  const facts={life_expectancy:{low:61,median:82,high:94}};
  const chart=rangeChart('Age',['Life expectancy'],[[facts,'life_expectancy']]);
  assert.equal(chart.coverage,.8);
  assert.deepEqual(chart.datasets.map(d=>d.data),[[61],[82],[94]]);
});
