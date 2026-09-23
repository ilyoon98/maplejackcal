#!/usr/bin/env node
// CoinShopData.xlsx → coin_shop_data.js
//
// 이벤트 코인샵 데이터는 저장소 루트의 CoinShopData.xlsx가 원본이다. 이 스크립트가 그 파일을
// 읽어 계산기 페이지(coin_shop_calc.html)가 쓰는 coin_shop_data.js를 만든다.
// 외부 패키지 없이 node만으로 돈다:  node tools/build_coin_shop_data.js
// Vercel 배포 때도 자동으로 실행된다(vercel.json의 buildCommand).
//
// 시트 구조 (첫 줄은 열 이름, 열 순서는 상관없고 이름으로 찾는다)
//   Event: EventID, Name, StartTime(날짜), EndTime(날짜), Weeks(코인 받는 주 수), WeekCoin(주당 코인)
//   Shop:  EventID, ItemID, Type(TypeID), Coin(가격), Value(구매 제한 수량), Limit(M=ID당, W=월드당)
//   Item:  ItemID, String(이름), Icon(icons/CoinShop/ 파일명. 둘이면 | 로 구분. 비우면 기본 아이콘)
//   Type:  TypeID, Name(탭 이름)

'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'CoinShopData.xlsx');
const OUT = path.join(ROOT, 'coin_shop_data.js');

// ---------- zip 읽기 (central directory 기준) ----------
function readZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip 형식이 아닙니다: ' + SRC);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip central directory가 깨졌습니다');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(localOff + 26), lelen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnlen + lelen;
    const raw = buf.slice(dataStart, dataStart + csize);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nlen + elen + clen;
  }
  return files;
}

// ---------- SpreadsheetML 읽기 ----------
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const colIdx = ref => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function readWorkbook(zipFiles) {
  const xml = f => { if (!zipFiles[f]) throw new Error('xlsx 안에 ' + f + ' 가 없습니다'); return zipFiles[f].toString('utf8'); };
  const shared = [];
  if (zipFiles['xl/sharedStrings.xml']) {
    for (const m of xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      shared.push(unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    }
  }
  const rels = {};
  for (const m of xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = (m[1].match(/Id="([^"]+)"/) || [])[1], target = (m[1].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
  }
  const sheets = {};
  for (const m of xml('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = unesc((m[1].match(/name="([^"]+)"/) || [])[1]);
    const rid = (m[1].match(/r:id="([^"]+)"/) || [])[1];
    const file = 'xl/' + rels[rid];
    const rows = [];
    for (const rm of xml(file).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[3] || '', inner = cm[4] || '';
        const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
        let v = (inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        if (t === 's') v = shared[+v];
        else if (t === 'inlineStr') v = unesc([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (t === 'str' || t === 'b' || t === 'e') v = v === undefined ? undefined : unesc(v);
        else if (v !== undefined) v = Number(v);
        if (typeof v === 'string') v = v.trim();
        if (v === '') v = undefined;
        row[colIdx(cm[1])] = v;
      }
      rows.push(row);
    }
    sheets[name] = rows;
  }
  return sheets;
}

// 첫 줄을 열 이름으로 삼아 객체 배열로. 완전히 빈 줄은 건너뛴다
function table(sheets, name) {
  const rows = sheets[name];
  if (!rows) throw new Error('"' + name + '" 시트가 없습니다');
  const header = (rows[0] || []).map(h => (h === undefined ? '' : String(h).trim()));
  return rows.slice(1)
    .filter(r => r.some(v => v !== undefined))
    .map((r, i) => {
      const o = { _row: i + 2 };
      header.forEach((h, c) => { if (h) o[h] = r[c]; });
      return o;
    });
}

const excelDate = n => {
  if (typeof n !== 'number') throw new Error('날짜 칸이 숫자(날짜) 형식이 아닙니다: ' + n);
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
};
const need = (o, k, where) => { if (o[k] === undefined) throw new Error(where + ' ' + o._row + '행: ' + k + ' 가 비어 있습니다'); return o[k]; };

// ---------- 변환 ----------
function build() {
  const sheets = readWorkbook(readZip(fs.readFileSync(SRC)));
  const events = table(sheets, 'Event');
  const shop = table(sheets, 'Shop');
  const items = table(sheets, 'Item');
  const types = table(sheets, 'Type');

  const typeById = {};
  types.forEach(t => { typeById[need(t, 'TypeID', 'Type')] = { key: 'type-' + t.TypeID, label: String(need(t, 'Name', 'Type')) }; });
  const itemById = {};
  items.forEach(it => {
    const id = need(it, 'ItemID', 'Item');
    const icon = it.Icon === undefined ? [] : String(it.Icon).split(/[|,]/).map(s => s.trim()).filter(Boolean);
    itemById[id] = { id: 'item-' + id, name: String(need(it, 'String', 'Item')), img: icon };
  });

  const out = events.map(ev => {
    const eventId = need(ev, 'EventID', 'Event');
    const tabs = types.map(t => typeById[t.TypeID]);
    const byTab = {};
    tabs.forEach(t => { byTab[t.key] = []; });
    shop.filter(s => s.EventID === eventId).forEach(s => {
      const item = itemById[need(s, 'ItemID', 'Shop')];
      if (!item) throw new Error('Shop ' + s._row + '행: ItemID ' + s.ItemID + ' 가 Item 시트에 없습니다');
      const type = typeById[need(s, 'Type', 'Shop')];
      if (!type) throw new Error('Shop ' + s._row + '행: Type ' + s.Type + ' 가 Type 시트에 없습니다');
      const limit = String(s.Limit === undefined ? 'M' : s.Limit).toUpperCase();
      if (limit !== 'M' && limit !== 'W') throw new Error('Shop ' + s._row + '행: Limit 은 M 또는 W 여야 합니다');
      byTab[type.key].push({
        id: item.id, name: item.name,
        price: Number(need(s, 'Coin', 'Shop')), stock: Number(need(s, 'Value', 'Shop')),
        limit: limit, icon: '🪙', img: item.img
      });
    });
    return {
      id: 'event-' + eventId,
      name: String(need(ev, 'Name', 'Event')),
      startDate: excelDate(need(ev, 'StartTime', 'Event')),
      endDate: excelDate(need(ev, 'EndTime', 'Event')),
      weeks: Number(need(ev, 'Weeks', 'Event')),
      perWeek: Number(need(ev, 'WeekCoin', 'Event')),
      tabs: tabs.filter(t => byTab[t.key].length),
      shop: byTab
    };
  });
  return out;
}

function render(events) {
  const lines = [];
  lines.push('// 이 파일은 CoinShopData.xlsx에서 자동으로 만들어진다. 직접 고치지 말고 xlsx를 고친 뒤');
  lines.push('//   node tools/build_coin_shop_data.js');
  lines.push('// 를 실행한다 (Vercel 배포 때는 자동 실행).');
  lines.push('window.COIN_SHOP_EVENTS = [');
  events.forEach((ev, ei) => {
    lines.push('  {');
    lines.push(`    id: ${JSON.stringify(ev.id)}, name: ${JSON.stringify(ev.name)},`);
    lines.push(`    startDate: ${JSON.stringify(ev.startDate)}, endDate: ${JSON.stringify(ev.endDate)}, weeks: ${ev.weeks}, perWeek: ${ev.perWeek},`);
    lines.push('    tabs: ' + JSON.stringify(ev.tabs) + ',');
    lines.push('    shop: {');
    Object.keys(ev.shop).forEach((k, ki, ks) => {
      lines.push(`      ${JSON.stringify(k)}: [`);
      ev.shop[k].forEach((it, i, arr) => {
        lines.push('        ' + JSON.stringify(it) + (i < arr.length - 1 ? ',' : ''));
      });
      lines.push('      ]' + (ki < ks.length - 1 ? ',' : ''));
    });
    lines.push('    }');
    lines.push('  }' + (ei < events.length - 1 ? ',' : ''));
  });
  lines.push('];');
  return lines.join('\n') + '\n';
}

try {
  const events = build();
  fs.writeFileSync(OUT, render(events));
  const summary = events.map(e => `${e.name} (${e.startDate}~${e.endDate}, ${e.weeks}주 × ${e.perWeek}) 품목 ${Object.values(e.shop).reduce((n, a) => n + a.length, 0)}개`);
  console.log('coin_shop_data.js 생성: ' + summary.join(' / '));
} catch (e) {
  console.error('변환 실패: ' + e.message);
  process.exit(1);
}
