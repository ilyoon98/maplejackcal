const {test} = require('node:test');
const assert = require('node:assert/strict');
const {compareUsage} = require('../actual_record.js');
test('실제 비용은 기대값 대비 절약·초과 비율로 비교한다',()=>{
  assert.deepEqual(compareUsage(5e9,3.2e9),{baseline:5e9,difference:-1.8e9,percent:36});
  assert.deepEqual(compareUsage(10000,15000),{baseline:10000,difference:5000,percent:50});
});
test('소수 기대 주흔은 표시 개수 기준으로 비교하고 0·동일값을 처리한다',()=>{
  assert.deepEqual(compareUsage(1234.6,1235),{baseline:1235,difference:0,percent:0});
  assert.deepEqual(compareUsage(0,100),{baseline:0,difference:100,percent:null});
  assert.deepEqual(compareUsage(100,0),{baseline:100,difference:-100,percent:100});
});
test('불가능한 목표나 유효하지 않은 입력에는 비교 결과를 만들지 않는다',()=>{
  for(const expected of [NaN,Infinity,-1,1e20]) assert.equal(compareUsage(expected,100),null);
  for(const actual of [NaN,Infinity,-1,0.5,1e20]) assert.equal(compareUsage(100,actual),null);
});
