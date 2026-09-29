const {test} = require('node:test');
const assert = require('node:assert/strict');
const {koreanAmount} = require('../money_input.js');
test('메소는 만·억·조 단위로 나누고 나머지 숫자를 보존한다',()=>{
  for(const [input,output] of [['1,000,000','100만'],['10,000,000','1000만'],['123,456,789','1억 2345만 6789'],['1234567890000','1조 2345억 6789만'],['100000001','1억 1'],['0','0']]) {
    assert.equal(koreanAmount(input), output+' 메소');
  }
});
test('빈 입력·비정상 값은 숨기고 억 단위 입력과 메이플포인트를 구분한다',()=>{
  for(const input of ['', '-1', 'abc', '1e8']) assert.equal(koreanAmount(input),'');
  assert.equal(koreanAmount('1.23456789',8),'1억 2345만 6789 메소');
  assert.equal(koreanAmount('2304.5',0,'메이플포인트'),'2304.5 메이플포인트');
  assert.equal(koreanAmount('9007199254740993'),'9007조 1992억 5474만 993 메소');
});
