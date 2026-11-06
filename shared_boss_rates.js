(function(){
  'use strict';
  var select=document.getElementById('shared-character'),status=document.getElementById('shared-status'),data=window.ScouterData,store=null;
  var difficulties={Easy:'이지',Normal:'노멀',Hard:'하드',Chaos:'카오스',Extreme:'익스트림'};
  function element(tag,text){var n=document.createElement(tag);n.textContent=text;return n;}
  function render(){
    var chosen=store.snapshots[Number(select.value)],snapshot=chosen&&data.findShared(store,chosen.characterName,chosen.preset),rows=document.getElementById('shared-rows');rows.replaceChildren();
    document.getElementById('shared-table').hidden=!snapshot;document.getElementById('shared-source').hidden=!snapshot;
    if(!snapshot){status.textContent='유효한 저장값이 없습니다. 30일 이상 지난 값은 다시 확인해야 합니다.';return;}
    document.getElementById('shared-name').textContent=snapshot.characterName;
    status.textContent='실제 브라우저 조회 · '+new Date(snapshot.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' (한국 시간) · 지원 배율 '+snapshot.rates.length+'개';
    document.getElementById('shared-conditions').textContent='기본 프리셋 '+snapshot.preset+' · 보스 시간 20분 · 데스티니/유챔 확인 켬 · 추가 스펙 시뮬레이터 끔';
    document.getElementById('shared-source').href=snapshot.sourceUrl;
    snapshot.rates.forEach(function(row){var parts=row.bossId.split('|'),boss=window.MapleBossDB[parts[0]],label=difficulties[parts[1]]+' '+(boss?boss.Name:parts[0]),tr=document.createElement('tr');tr.append(element('td',label),element('td',row.percent.toLocaleString('ko-KR',{maximumFractionDigits:2})+'%'),element('td',row.eligibility||'—'));rows.appendChild(tr);});
  }
  fetch('shared_scouter_snapshots.json').then(function(response){if(!response.ok)throw new Error();return response.json();}).then(function(value){
    if(!value||value.schemaVersion!==1||!Array.isArray(value.snapshots))throw new Error();store=value;select.replaceChildren();
    var wanted=new URLSearchParams(location.search).get('name'),selected=0;
    store.snapshots.forEach(function(snapshot,index){if(!snapshot||!data.validName(snapshot.characterName))return;var option=element('option',snapshot.characterName);option.value=String(index);select.appendChild(option);if(snapshot.characterName===wanted)selected=index;});
    select.disabled=!select.children.length;select.value=String(selected);select.addEventListener('change',render);render();
  }).catch(function(){status.textContent='공용 저장값을 불러오지 못했습니다. 사이트 주소로 열었는지 확인한 뒤 다시 시도하세요.';});
})();
