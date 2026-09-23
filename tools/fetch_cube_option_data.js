#!/usr/bin/env node
// 넥슨 공식 확률 페이지 → cube_option_data.js (큐브 옵션 확률 계산기 cube_option_calc.html이 읽는다)
//
// maplestory.nexon.com/Guide/OtherProbability/cube/* 의 "확률 검색"이 쓰는 API를 그대로 호출해
// 레전드리 등급의 옵션별 등장 확률을 큐브 × 장비 분류 × 레벨 구간으로 모은다.
// 옵션 표는 그 레벨에 실제 있는 장비에 따라서도 달라지므로 0~250 모든 레벨을 조회해 같은 표끼리 묶는다(약 2만 요청, 1분 이내).
// 넥슨이 확률을 바꾸면 한 번 다시 돌리면 된다:  node tools/fetch_cube_option_data.js

'use strict';
const fs = require('fs');
const path = require('path');

const OUT = path.join(path.resolve(__dirname, '..'), 'cube_option_data.js');
const API = 'https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList';
const GRADE = 4; // 레전드리

// 레전드리 등급이 있는 큐브만 (수상한·장인·수상한 에디셔널은 유니크까지)
const CUBES = [
  { key: 'black', id: 5062010, name: '잠재능력 재설정 / 블랙 큐브' },
  { key: 'red', id: 5062009, name: '레드 큐브' },
  { key: 'artisan', id: 2711004, name: '명장의 큐브 / 골드 큐브' },
  { key: 'addi', id: 5062500, name: '에디셔널 잠재능력 재설정 / 에디셔널 큐브 / 화이트 에디셔널 큐브' }
];
const PARTS = ['무기', '엠블렘', '보조무기(포스실드, 소울링 제외)', '포스실드, 소울링', '방패', '모자', '상의', '한벌옷', '하의',
  '신발', '장갑', '망토', '벨트', '어깨장식', '얼굴장식', '눈장식', '귀고리', '반지', '펜던트', '기계심장'];
const MAX_LEV = 250;
const LEVELS = Array.from({ length: MAX_LEV + 1 }, (_, lv) => lv);

async function fetchTable(cubeId, part, lv) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
        body: `nCubeItemID=${cubeId}&nGrade=${GRADE}&nPartsType=${part}&nReqLev=${lv}`
      });
      const html = await res.text();
      if (html.includes('해당하는 장비 아이템이 없습니다')) return null; // 그 레벨엔 이 분류 장비가 없음
      if (!html.includes('cube_data')) throw new Error(`표가 없는 응답 (cube ${cubeId}, part ${part}, lv ${lv})`);
      return parse(html);
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// 표 3개(첫·두·세 번째 옵션) → [[옵션, 확률(%)], ...] × 3
function parse(html) {
  const lines = [];
  for (const t of html.split('<table class="cube_data').slice(1)) {
    const body = t.slice(0, t.indexOf('</table>'));
    const rows = [];
    for (const tr of body.split('<tr>').slice(1)) {
      const tds = [...tr.matchAll(/<td>([^<]*)<\/td>/g)].map(m => decode(m[1].trim()));
      if (tds.length < 2) continue;
      rows.push([tds[0], Number(tds[1].replace('%', ''))]);
    }
    lines.push(rows);
  }
  return lines;
}

function decode(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

async function pool(tasks, n) {
  const out = new Array(tasks.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < tasks.length) {
      const k = i++;
      out[k] = await tasks[k]();
      if (++done % 200 === 0) process.stderr.write(`  ${done}/${tasks.length}\n`);
    }
  }));
  return out;
}

(async () => {
  const jobs = [];
  for (const c of CUBES) for (let p = 1; p <= PARTS.length; p++) for (const lv of LEVELS) jobs.push({ c, p, lv });
  process.stderr.write(`요청 ${jobs.length}개\n`);
  const tables = await pool(jobs.map(j => () => fetchTable(j.c.id, j.p, j.lv)), 8);

  const data = {};
  for (const c of CUBES) data[c.key] = { name: c.name, parts: {} };
  // 같은 표가 이어지는 레벨을 한 구간으로 묶는다. 장비가 없는 레벨(null)은 건너뛰어 앞 구간에 붙인다.
  jobs.forEach((j, k) => {
    if (!tables[k]) return;
    const brackets = (data[j.c.key].parts[PARTS[j.p - 1]] ||= []);
    const last = brackets[brackets.length - 1];
    if (last && JSON.stringify(last.lines) === JSON.stringify(tables[k])) last.max = j.lv;
    else brackets.push({ min: j.lv, max: j.lv, lines: tables[k] });
  });

  // 옵션 이름은 options 목록에 한 번만 두고, 표에는 [옵션 번호, 확률(%)]로 적는다
  const options = [], index = new Map();
  const idx = name => { if (!index.has(name)) { index.set(name, options.length); options.push(name); } return index.get(name); };
  for (const c of Object.values(data)) for (const brackets of Object.values(c.parts))
    for (const b of brackets) b.lines = b.lines.map(rows => rows.map(([name, p]) => [idx(name), p]));

  const out = { source: 'maplestory.nexon.com/Guide/OtherProbability/cube', grade: '레전드리', fetchedAt: new Date().toISOString().slice(0, 10), options, cubes: data };
  fs.writeFileSync(OUT, '// 자동 생성 파일 — 직접 고치지 말고 node tools/fetch_cube_option_data.js 로 다시 만든다\n' +
    '// 구조: cubes[큐브].parts[장비 분류] = [{ min, max, lines: [첫째 줄, 둘째 줄, 셋째 줄] }], 줄 = [[options 번호, 확률(%)], ...]\n' +
    'const CUBE_OPTION_DATA = ' + JSON.stringify(out) + ';\n');
  process.stderr.write(`→ ${path.relative(process.cwd(), OUT)}\n`);
})().catch(e => { console.error(e); process.exit(1); });
