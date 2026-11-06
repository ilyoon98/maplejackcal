(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BossIdentity=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Same face assets and difficulty badge palette used by boss_buff_planner.
  var icons={Lotus:'suu',Damien:'damien',GuardianAngelSlime:'guardian_angel_slime',Lucid:'lucid',Will:'will',Dusk:'dusk',Dunkel:'dunkel',VerusHilla:'jin_hilla',BlackMage:'black_mage',ChosenSeren:'seren',KalosTheGuardian:'watcher_kalos',TheFirstAdversary:'first_challenger',Kaling:'kaling',Limbo:'limbo',Baldrix:'baldrix',RadiantMalefic:'radiant',Jupiter:'jupiter',Bellona:'vellona',Zakum:'zakum',Magnus:'magnus',Papulatus:'papulatus',Vellum:'vellum',BloodyQueen:'bloody_queen',VonBon:'banban',Pierre:'pierre'};
  var diff={Easy:'이지',Normal:'노멀',Hard:'하드',Chaos:'카오스',Extreme:'익스트림'};
  function create(doc,id,db){var p=id.split('|'),box=doc.createElement('span');box.className='boss-identity';if(icons[p[0]]){var img=doc.createElement('img');img.src='icons/boss/'+icons[p[0]]+'.webp';img.alt='';img.className='boss-face';box.append(img);}var name=doc.createElement('span');name.textContent=db[p[0]]?db[p[0]].Name:'보스';var badge=doc.createElement('span');badge.className='diff-badge '+String(p[1]).toLowerCase();badge.textContent=diff[p[1]]||'';box.append(name,badge);return box;}
  function picker(doc,select,db){
    var details=doc.createElement('details'),summary=doc.createElement('summary'),list=doc.createElement('div');details.className='boss-picker';summary.setAttribute('aria-label',select.getAttribute('aria-label')||'보스 · 난이도 선택');list.className='boss-picker-list';
    function update(){summary.replaceChildren(create(doc,select.value,db));}
    Array.from(select.options).forEach(function(option){var button=doc.createElement('button');button.type='button';button.append(create(doc,option.value,db));button.addEventListener('click',function(){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));details.open=false;update();summary.focus();});list.append(button);});
    select.addEventListener('change',update);select.hidden=true;select.after(details);details.append(summary,list);update();return details;
  }
  return {create:create,picker:picker};
});
