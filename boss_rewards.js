(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.BossRewards=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Item slots follow the difficulty panels in Nexon's official boss guide.
  var guide='https://maplestory.nexon.com/guide/n23gameinformation/articles/459';
  var bronze='메멘토 브론즈 에디셔널 큐브 (200제)',silver='메멘토 실버 큐브 (200제)',gold='메멘토 골드 큐브 (200제)';
  var green='녹옥의 보스 반지 상자',red='홍옥의 보스 반지 상자',black='흑옥의 보스 반지 상자',white='백옥의 보스 반지 상자',life='생명의 보스 반지 상자';
  var arcaneWeapon='아케인셰이드 무기 상자',arcaneArmor='아케인셰이드 방어구 상자';
  var absolWeapon='앱솔랩스 무기 상자',absolArmor='앱솔랩스 방어구 상자';
  var twilight='트와일라이트 마크',estella='에스텔라 이어링',daybreak='데이브레이크 펜던트';
  var grindLife='생명의 연마석',grindFaith='신념의 연마석',pitch='혼돈의 칠흑 장신구 상자';
  var erion='에리온의 조각 교환권',potion='영롱한 달빛 포션';
  var ether1='1단계 소울 에테르',ether2='2단계 소울 에테르',ether3='3단계 소울 에테르',ether4='4단계 소울 에테르';
  var energy=function(points){return ['솔 에르다의 기운',points,'기운'];};

  // [first slot center X, center Y, columns, slots, X step, Y step].
  // Null slots retain the icon position when several energy drops are shown as one total.
  // Cube quantities reflect 1.2.418. Kalos/Kaling materials reflect 1.2.406.
  // https://maplestory.nexon.com/news/update/813
  // https://maplestory.nexon.com/news/update/779
  // Other fixed amounts cross-checked against player reward records and the supplied example.
  // https://matsu1207.tistory.com/937
  // https://namu.moe/w/HEXA%20%EB%A7%A4%ED%8A%B8%EB%A6%AD%EC%8A%A4 (boss energy table)
  var sheets={
    Lotus:{
      Normal:[35,65,3,['특수형 에너지 코어(S급)',bronze,green],48],
      Hard:[229,66,4,[absolWeapon,absolArmor,'루즈 컨트롤 머신 마크','특수형 에너지 코어(S급)','스우로이드',bronze,red,energy(50)],48,46],
      Extreme:[470,64,4,['컴플리트 언더컨트롤','루즈 컨트롤 머신 마크','섬멸병기 스우로이드',white,null,energy(280)],48,49]
    },
    Damien:{
      Normal:[35,67,4,['루인 포스실드','뒤틀린 낙인의 영혼석',bronze,green],48],
      Hard:[277,67,4,[absolWeapon,absolArmor,'마력이 깃든 안대','루인 포스실드','뒤틀린 낙인의 영혼석','데미안로이드',bronze,red,energy(50)],48,50]
    },
    GuardianAngelSlime:{
      Normal:[36,64,3,['가디언 엔젤 링',bronze,green],46],
      Chaos:[241,65,4,['가디언 엔젤 링',[silver,1],bronze,black,energy(70)],46,46]
    },
    Lucid:{
      Easy:[38,63,2,[bronze,green],47],
      Normal:[199,63,4,[twilight,'나비날개 물방울석',bronze,green],46],
      Hard:[427,63,4,[arcaneWeapon,arcaneArmor,'몽환의 벨트',twilight,'나비날개 물방울석','루시드로이드',[silver,1],bronze,red,energy(50)],46,47]
    },
    Will:{
      Easy:[38,62,2,[bronze,green],47],
      Normal:[198,62,4,[twilight,'코브웹 물방울석',bronze,green],46],
      Hard:[427,62,4,[arcaneWeapon,arcaneArmor,'저주받은 마도서 선택 상자',twilight,'코브웹 물방울석','거울세계의 코어 젬스톤',[silver,1],bronze,red,energy(50)],46,47]
    },
    Dusk:{
      Normal:[37,69,3,[estella,bronze,green],46],
      Chaos:[244,70,4,[arcaneWeapon,arcaneArmor,'거대한 공포',estella,[silver,1],bronze,black,energy(100)],46,47]
    },
    Dunkel:{
      Normal:[35,70,3,[estella,bronze,green],46],
      Hard:[244,71,4,[arcaneWeapon,arcaneArmor,'커맨더 포스 이어링',estella,[silver,1],bronze,black,energy(120)],46,47]
    },
    VerusHilla:{
      Normal:[37,70,4,[arcaneWeapon,arcaneArmor,daybreak,null,bronze,red,energy(70)],47,47],
      Hard:[269,71,4,[arcaneWeapon,arcaneArmor,'고통의 근원',daybreak,[silver,1],bronze,black,energy(120)],46,47]
    },
    BlackMage:{
      Hard:[35,68,4,[arcaneWeapon,arcaneArmor,'봉인된 제네시스 무기 상자',bronze,white,null,energy(300)],48,50],
      Extreme:[225,68,4,['익셉셔널 해머 (벨트)',arcaneWeapon,arcaneArmor,'창세의 뱃지',white,null,energy(600)],49,50]
    },
    ChosenSeren:{
      Normal:[35,67,4,[daybreak,[silver,2],bronze,black,energy(150)],48,49],
      Hard:[277,66,4,['미트라의 분노 선택 상자',daybreak,'미트라의 코어 젬스톤',gold,bronze,white,null,energy(220)],49,49],
      Extreme:[518,66,4,['익셉셔널 해머 (얼굴장식)','미트라의 분노 선택 상자',daybreak,'미트라의 코어 젬스톤',white,null,energy(560),potion,[erion,30]],49,49]
    },
    KalosTheGuardian:{
      Easy:[33,65,4,[gold,bronze,white,energy(200)],49],
      Normal:[252,65,4,[['남겨진 칼로스의 의지 조각',3],'니키로이드',[gold,3],white,null,energy(250),grindLife],48,49],
      Chaos:[470,65,4,['의지의 에테르넬 방어구 상자',['남겨진 칼로스의 의지',5],'니키로이드',life,energy(400),grindLife],49,49],
      Extreme:[689,65,4,['익셉셔널 해머 (눈장식)','의지의 에테르넬 방어구 상자',['남겨진 칼로스의 의지',14],'니키로이드',life,null,energy(700),grindLife,potion,[erion,180]],48,50]
    },
    TheFirstAdversary:{
      Easy:[28,65,4,[gold,bronze,white,energy(200)],48],
      Normal:[243,65,4,[['이어진 고대의 결의 조각',4],'대적자로이드',[gold,3],white,null,energy(280),grindLife,ether1],49,51],
      Hard:[459,65,4,['불멸의 유산','고대의 에테르넬 방어구 상자',['이어진 고대의 결의',6],'대적자로이드',life,null,energy(450),grindLife,[erion,30],ether1],49,50],
      Extreme:[676,65,4,['익셉셔널 해머 (훈장)','불멸의 유산','고대의 에테르넬 방어구 상자',['이어진 고대의 결의',16],'대적자로이드',life,energy(750),grindLife,potion,[erion,240],ether1],49,51]
    },
    Kaling:{
      Easy:[29,64,4,[['뒤엉킨 흉수의 고리 조각',1],gold,bronze,white,energy(200)],48,48],
      Normal:[243,62,4,[['뒤엉킨 흉수의 고리 조각',5],'카링로이드',[gold,3],white,null,energy(300),grindLife,pitch,ether1],49,50],
      Hard:[455,62,4,['흉수의 에테르넬 방어구 상자',['뒤엉킨 흉수의 고리',7],'카링로이드',life,energy(500),grindFaith,pitch,[erion,60],ether1],49,50],
      Extreme:[673,62,4,['익셉셔널 해머 (귀고리)','흉수의 에테르넬 방어구 상자',['뒤엉킨 흉수의 고리',18],'카링로이드',life,energy(800),grindFaith,pitch,potion,[erion,400],ether1],49,50]
    },
    Bellona:{
      Easy:[33,66,4,[[gold,2],white,null,energy(200)],48],
      Normal:[252,66,4,[['저주받은 원혼의 잔재',1],'벨로나로이드',white,null,energy(290),grindLife,pitch,ether2],49,51],
      Hard:[475,65,4,['굶주리는 핏빛 원혼','광기의 에테르넬 방어구 상자',['저주받은 원혼의 잔재',2],'벨로나로이드',life,null,energy(590),grindFaith,pitch,[erion,100],ether2],48,49]
    },
    RadiantMalefic:{
      Normal:[31,67,4,[['황홀한 환상의 단편 조각',6],'흉성 로이드',[gold,3],white,null,energy(380),grindLife,pitch,ether2],49,49],
      Hard:[271,68,4,['황홀한 악몽','환상의 에테르넬 방어구 상자',['황홀한 환상의 단편',18],'흉성 로이드',life,null,energy(550),grindFaith,pitch,[erion,90],ether2],49,49]
    },
    Limbo:{
      Normal:[34,64,4,[['왜곡된 욕망의 결정',1],'림보로이드',life,null,energy(400),grindFaith,pitch,ether3],47,47],
      Hard:[263,64,4,['근원의 속삭임','욕망의 에테르넬 방어구 상자',['왜곡된 욕망의 결정',2],'림보로이드',life,null,energy(600),grindFaith,pitch,[erion,60],ether3],46,47]
    },
    Baldrix:{
      Normal:[38,70,4,[['영원한 충성의 흔적',1],'발드릭스로이드',life,energy(450),grindFaith,pitch,ether3],46,47],
      Hard:[267,70,4,['죽음의 맹세','맹세의 에테르넬 방어구 상자',['영원한 충성의 흔적',2],'발드릭스로이드',life,null,energy(650),grindFaith,pitch,[erion,120],ether3],46,47]
    },
    Jupiter:{
      Normal:[32,68,4,[['뒤틀린 갈망의 편린',1],'유피테르로이드',life,null,energy(450),grindFaith,pitch,[erion,45],ether4],49,49],
      Hard:[272,68,4,['오만의 원죄','갈망의 에테르넬 방어구 상자',['뒤틀린 갈망의 편린',2],'유피테르로이드',life,null,energy(750),grindFaith,pitch,[erion,360],ether4],49,49]
    }
  };

  // The Black Mage panel omits the silver cube awarded since 2026-10-01.
  var extras={'BlackMage|Hard':[{name:silver,quantity:8,unit:'개',image:'icons/boss-rewards/GuardianAngelSlime.png',x:267,y:45}]};

  function forBoss(bossId){
    var [boss,difficulty]=bossId.split('|');
    var group=sheets[boss]?.[difficulty];
    if(!group)return [];
    var [x,y,columns,slots,stepX,stepY=48]=group;
    return slots.flatMap(function(slot,index){
      if(!slot)return [];
      var [name,quantity,unit]=Array.isArray(slot)?slot:[slot];
      return [{name:name,quantity:quantity,unit:unit||'개',image:'icons/boss-rewards/'+boss+'.png',
        x:x+index%columns*stepX-20,y:y+Math.floor(index/columns)*stepY-20}];
    }).concat(extras[bossId]||[]);
  }
  return {guide:guide,forBoss:forBoss};
});
