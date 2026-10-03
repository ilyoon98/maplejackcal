// 보스 배율 스크린샷 읽기.
// 다른 사이트의 '보스 카드 격자' 캡처에서 카드마다
//  ① 초상화 → 어떤 보스인지(사이트 아이콘과 비교)
//  ② 초상화 아래 배지 색 → 난이도
//  ③ 맨 아래 줄의 "143.1%" → 배율
// 을 읽는다. 전부 브라우저 안에서 픽셀로 처리하고 서버로 보내지 않는다.
//
// 기준 화면(카드 72×136px, 숫자 8px 비트맵 글꼴)을 1배로 보고,
// 확대·축소된 캡처는 카드 폭으로 배율을 잡아 같은 크기로 맞춰 읽는다.
(function (root) {
  'use strict';

  // 기준 화면의 카드 안 초상화 위치(카드 폭 72 기준 px).
  var BASE_CARD_W = 72;
  var PORTRAIT = { x: 9, y: 9, w: 54, h: 53 };
  var GLYPH_H = 8;
  var GRID = 12;            // 초상화 비교 격자(12×12 칸 평균색).

  // 배율 줄 글꼴. 8줄 비트맵, '#'이 칠해진 칸.
  var GLYPHS = {
    '0': '.###./#..##/#...#/#...#/#...#/#...#/#...#/.###.',
    '1': '.##/###/###/.##/.##/.##/.##/.##',
    '2': '.###./#..##/....#/...#./..##./.##../##.../#####',
    '3': '.###./#...#/....#/...#./..###/....#/#...#/####.',
    '4': '...#./..##./.###./.#.#./#..#./#####/...#./...#.',
    '5': '#####/#..../#..../####./#...#/....#/#...#/####.',
    '6': '.###./##..#/#..../####./#...#/#...#/#...#/.###.',
    '7': '######/....##/....#./...##./...#../..#.../..#.../.#....',
    '8': '.###./#...#/#...#/##.#./#####/#...#/#...#/####.',
    '9': '.###./#..##/#...#/#...#/#####/....#/#...#/####.',
    '.': './././././././#',
    '%': '###...#./#.#..#../#.#.#.../###.#.../...#..#./..#..#.#/..#..#.#/.#...###'
  };
  var TEMPLATES = Object.keys(GLYPHS).map(function (ch) {
    var rows = GLYPHS[ch].split('/');
    var w = rows[0].length, bits = new Uint8Array(w * GLYPH_H);
    rows.forEach(function (r, y) { for (var x = 0; x < w; x++) bits[y * w + x] = r[x] === '#' ? 1 : 0; });
    return { ch: ch, w: w, bits: bits };
  });

  // 그 사이트의 초상화 서명(tests/fixtures/boss_shot_1.png에서 뽑은 signature(), int8·base64).
  // 사이트가 보스마다 다른 위치로 잘라 쓰고, 검은 마법사처럼 아예 다른 그림인 보스도 있어서
  // 아이콘만으로는 헷갈리는 경우를 이걸로 먼저 맞힌다. 익스트림은 테두리가 달라 따로 있다.
  var SITE_PORTRAITS = {
    '유피테르': ['DxISDRAQ9fr64Ofm3+Xl5Ovq5+zr6Ovs5+nq/wQE9/785e3q4ejl6Ozp5O7r5O3q4efn5evq8Pn34/Ds6/TvHxQQJRkU8Pfy5vPt3unm3+Xj4vLt5/Tu6/bwDgwGFhAKAQP8Ew4I4Onk6+rq3PPq3vruBwsC5/rw5/Dp/QT7BgP/BQUAEQoH3/Lp4gr37xIAFxIOCRsSEz8nKCkjIBkUAgUABxIMDzMfFiofSURASUVCREZALiwn7/315Pnu/QL+NDIvQj47Qz47Mi4sDxUM/Af+/wLx9vnt6unp4eDf6ejoAv/+/frz/vvx//32+ffu9/Tr'],
    '카링': ['LAMFLAYHLgP/Lf72L/73MAD4LwH4L/72H/fxLPsDLPX9MubxMOPtNujvOezyOO7yOvL2LvL0Gev3Ed7rFd3pGN3qH+DsJOLtI+LuNu30LvH0EuHuCNroC9ztDN3sDdzsDtzrD9zqIOPuLO7z+trl/OXfDe/uD+/5BOLs/t3pBN7pD97qGOXtBt3qIRP8Lxz+IA0QEQsO7Bsl9/L2G+jvEOXtANjpIRkWODEqOjcxNjYzGTU3FhARJ+ryDOLs+NXo+N3pB/n+FxEQGRMRFw8PCvL4C93qANzp/tbv+OPt8Ofp9vHx+fDwCAQHBuTr/Nfm/9rq'],
    '최초의 대적자': ['KBMEIw39EvzsFgb3HQ7/Fgf5KBkJSS4XLQrvBAMF/Pv84eDhJi8vLDk7GSYpNz4/GxsdMA8F8vL15+bo8ff6JDM1IzU5Dh8jGScrJCkpNB8V5+ns5+jq+gIFKDc5FiYr+QYK5u7x/QQFFP715+716u3w7vHzAxIX+QMG4OTn3N7g397gB+zl6PUB8Pr/+PwABgQD3N7g3N7g3d/h5+XlC+/r9QsbAAUIEwoJ+fn53N/h3ODj4OXq7PD3KwwQ9AQN7PT45ezy3uLl3N/i3uHl3+Xq7vcCIAYPByUsCBwo8/wD6+7x7O/x4eTm4OTp5uz1EPcB', 'GhweDxAS+fr8+gQHAw8SBhATDRkdREZGGBwhAgMF+vr83+DiIiwuKDc6FSMnNDw+Fh0kHBYn8vL15+bo8Pb5IjAzITI2DR4hFyUpIScpJywy5+ns5+jq+QEEJjQ2FSQp+QUJ5u7x+wMF/QMG5+716u3w7vDyAxEV+AIF4OTn3d/h3d7g6Ofn6PUA8Pn/9/z/BQQC3N7g3N/h3d/h5eXm7u3t9AkaAAQHEgkI+fn53N/h3eDj4OXq6vD3Hxwk9AMM7PP45ezx3uLl3eDi3uLl4OXq7PcCEBQhBiMpBxol8/sC6+7x7O/x4eTn4OTp4+z09v8J'],
    '감시자 칼로스': ['VDMdRh8KKQr2HQDsHv7oIQDqG/7pJwHmOgzqHBQTNwoDKvHm9evn9ezo+u7r+PHs+u7mKwTqDAL/BvLuCe/mAfHqC/Xr+O/r7evn7uriHPrn+/Pv++3q9+vnHPzqLwbw7+rm6unm7OrlGvfp+PTs+uzpD+/mTxn9H/7t+Ork8Onm7unlG/bsEw4G/OvoF+7iIfzs/+vmAOzp/O/s+urlGfPtJCEZ7urp9Orl8OnkEvntZ00jMyQY9+rpHfXzEw4K8+/s7+vo8OznKhkIZ0wdDP7x+PDqHvT1FhAJEQX7LyASSjkbRDYdEwT48/Dq9/HtI/z/', 'VEtHOCcnDgcG/Pj4+PHv/vTx9/Px9e7s//n4HhgYOw4HLPPp9ezp9e3r+u/u+PLu8evpBPnyDwUCCfXwDfHoBfTsDvju+/Lt8O3p7evk++/q/vXy/u/s+u3qIP/sNAny8e3p7Ozo7Ovn9uvp+/bv/e7sE/HpVR0BJALw++3n8+zo7ern9+zqFhIJ/+7rG/HlJQDvAu3oA+/rAPLv+uzn9uzpKSUd8Ozr9u3n8+vnFvzwbVMnOCkc9uzr+vDvFxIN9vLu8u3r8+7pLx0LbVEiEAL0+PLs//HwGhQNFQj+NCQWTz4fSjshFwf79vLs9/PuBwEA'],
    '발드릭스': ['+AcK+wMF6Bcc2Obq2evz4wkZ8hEcIi0u/wkT7xUX6/Lz3QsN2AIG4v0IFiwtGCwtCyYr5/YC5QgJ3+bm3fX82ycm+yMqHC0u8AcP3fX/2/sG2/8F2/P67wYY+iQsFystFSos3ezz1/oD2gIL3P3+2/b8EiMpIi0tGCYsASEo2Ozx1wYP2wcN2+nu2t3gAhAYARkm3vsQ2xIZ2AUL1wUM3BIT4/kE3ePo5/T93/UI3Q0R2x0d2h4e2iIf3gMC4vH14ezx2t7i4wUJ5Cgl3Rca2x4e2x8b3+jqBh8g4uns8vT2ACYk6yMj3xQY3BgX2//+4OPl'],
    '벨로나': ['PDk5PTs7My8w9+7v9Ozt8u3u8Ozu7+3u9PL0OzY3ODIzKiQmAPb49e/w9vHz9vL18e7w7uzuMCcqKh8iFAQG8uvt8uzu7uvt7+vu6efo5+bnFAoMAPX1Bvj76+Xm6eXm5uPk5OLk5OPk5ubnAvn6DwwaB/QL9Ozt7Ofo6ujp5eTl5OPk5+foFwkLIBYaJhodHxYWCf//+vD6+fDz5eXl5ubnDgYHQT45NDIvHxATHRMVDwYGAPj95+Xm6ujpBgAADgkJIh4dMSgoLycnOTY0GxcX6efo+fX28evs/PDxAPf3+fX2+/j59fT06+vr5OPk5+bn'],
    '림보': ['IAwrHAkeMvsx+dT76dPv7truA9oA4NDlAd4GCfMPCOoMIuYgC9oJ99f88djz8dbu8dLy+NX3BuULAuMHNPEyG+AU9Nr6CtoOCtsK/tn779nv+d/6GfgoSv1KKuskB+4W9tv0/tz2EuAKB+YC/uL6B+8PFO4V/eP/BekLBeH5KecTF+AOFuUNCer/A+j58uLx9OLyJgcZMAceCNoGGeEKCeYIHwUhDfUF7dvt7dzsHwcWJwkiCt0OHuINFegQGf0lKR8sJRwlJRwlJBooEfYaB9YH+tz4A+wD/dUCE/ocNiI6OBw9JPgn/dEF7c7v487j69Xt'],
    '찬란한 흉성': ['HBQAGRH9FQ71EgzvDgXjCgLi+vLcHhncEwvXGA7xIx70JiX8JSP0EgLdIRzeFhHbBv7bBv/aJB/uJiPrJiTtJSDoFwbvHhLeJSDaDwfX8ujVJSHlJSL0JiMAIxv5GQnqHxL5IRLkIRLX+O7XJBvpJRzyJRjjJBPYDPrZA/Td+enRGAPPCPfcIxfpFwbSGATOJBXaGgniHg3fFgbwHQzl+urdJBPPBfPTE//XIxoQJR4XJRsRHBMFGQnWCP7U+/DTDPrXFwv7IRwWHRYRA/765t/Y//LLGBDXDgHUBfbS6d/O2dbW6ubn7+3t8e/u7+PLB//W'],
    '선택받은 세렌': ['IAXxIATwE/biE/LdFfTeF/jgQCT0ORjxLgTgDAP+B/z39Oji9efg+uvk+OriJBr9QzgOORf3Avfy+Ovm9Oji9Ofi8eXf8uXg/vTpRz4QOx//FwL7Ae/p9unj9Ofi8OTf7eLd7uPeIxj3QyX9MRgOEP72FgP7//Dq9uji7uLe8OTfAPLkLg7xCwDsDP/uLxcOIQwEEgbr+u/i8eXgEQj3IgPyLx8FRC8VQycdQSgeSTkTHg798OTfBAEBGPn39OrlJBQNLBYOJxMLHxMN9Orl6+Dc6NvYA97d8ejkEhAQAf79/Pr4DwsJ7+TgGxYK8ufgBN7f', 'DwoGDQcE/vXx/e/p//DqBPrwPTYLLSgRJiIPCQH+BPv38ufh8uXg9+nj9ejiIhn9PjgSNC8cAPXx9+rl8+fh8+bh8OTe8eTf/fPoRD4QNzMdFQH5/+7o9eji8+bh7+Pe7OHc7eLeIRj4QTsTLxYNDvz1FAH6/u/p9Ofh7eHd7+Pf/PHjKyQDCv7rCv3tLRUMIAsDEQTq+e7h8OTfDgj2FxQALR0DQi0TQSUbPyYdRjYSHAz87+PeAQEABQMA8+nkIhIMKhUMJRIKHhEM8+nk6t/b5NrX5NzZ8OfjEQ8P//38+/j3DQkI7uPfGRQJ7+be5t3a'],
    '검은 마법사': ['MScfIxkRDwb9AffvCP30DAL5IhkRST00OioeIiEfCggF8fHv7u3s8O/tAPz5CAgFT01LST01CwkH8fHw7e3r7ezr7ezr/Pj2/fz6Q0JBSkA69vXz7e3s7e3s7Ozr7Ozr8/HwAP36JCQiRz057u7t7e3s7e3s7Ovr7Ovq7e3s/vv4ExQRPjUx8vHw7e3s7e3s7evq7ezr8e/u+/r4IB8dRTo4BAQD7+/u7ezr7uzr7u3r8vDv9/b1FBQSKR8d8vHw7u3s8e7s7+3r8O3s8vDu9PLx+/n4DAD+8e/u7+zr9O7s8u7r+PLv+PPx9fHv9/PyCfr5'],
    '스우': ['ZUcwY0QsUjAYIgDsKQn0H/7qLgz3VCkKRg3iXFlXUk5MDwkK//n8Eg0O/vj7/vj7Cv78LQTsNTIyGxcZ/fj7CAIFAvwA+/X5//r+/fb4FfHgCQQI/fj9APoA/vn+/Pf99vH2AfwA+/P3D+ne+vb99fL4+vb99vT78uvx9Orv+vf9//f6EOni+vkA+fb+9vX89O709+nt6Ofq6+To9/D1Eenn8/P5+AMM8u/39+3x7AkV4fH66uLn7uftDePl8erwA/wDBPL5A/L5A/T6//r+//n+BP0CGOzx+/f86+rv29vjxMTMztPb8u/zEgsNIxUQKfv/', 'WVlXV1ZURT89CwYIEQwPBwIEIBscR0RCNzc1UVBOSEZECwYI/Pf6DgkL+/b5+/b5A/3/GhYWLisrFxMU+/b5Bf8C//r9+fT3/fj7+fT4+vX4BgEF+/b6/fj9/Pf8+vX69PD0/vn+9/L28u7x+PT79PD2+PT79PP58evv8uru+PX7+vX58u7y+Pf+9/T79PT68u3z9uns6Ofp6uTo8+/09PH18vL39gAI8e729uzw7AYR4fD46eLn6+ft7+3x7+rvAPoAAfH3APH3AfP4/Pj8/Pf8APwA/Pn8+fX66+ru3Nzjx8fO0NXb8e7yDggJHBINGRMU'],
    '진 힐라': ['TRccLRAV/vL6+uHs+OHqR/P9Cefu6+bl6+joWhAYNgIL6t3m7Nvl9dznXvT9O+z37eHj8u3tUQENRfMABff7Av4ACfn9WPP/WPL9AuTs+PXzSvUBVfMAFf0BBAEB/vj5TvIAUvIADuTv+PPyQvD8SfL+C/r+8/Lx8fXpK+32SvL/DeLx+O3vO+77Fuv1BQECAwIAGyL4AvXuJun4B+Hx+OTsEOfyBPr+CAUFBgMDBwUFBPz//9/tCOLx+uHsGgsPDAkJBwQEBgMDCQYGCPr8+t/q/eDtAePw9/H1GxoaHRwbFhQU/vv8593i79zk59rk/eLt'],
    '듄켈': ['JCQlKCcoEg8NFAwIEw0LBwQLBwUN9vT1KiUSExMUCQkK7OvtFwr7CQL6AwAJAP8G+vfzLSMM/Pz95+fo4+Pi9/Ht5uXo7+7z8/L3FA39LSQM7u3u4uLj+vLs+PPv6uru7+3u9vHtKiQIIRcEAgH4+vTtA/rzA/v0AfnzAPHt+vHs7+zsBf72GhgMCwP67ezu+e/qEuTnO+fuDffzDwoDCAb9BwYADAYB5uXo69zeMebsKeftCPX78fH09vX57+/x6Ojo3Nzc4d/g7eTlCf4EPjtA9vX48vH0Gxke8fD05+bo7+7x6unrDAkPend7WFhaJCMm'],
    '더스크': ['AvwHDAkR/fkD8Oj48Ob58OT57uL37uT07ebzBP8L/vkE8+n57d315Nbu5tT059T46Nb56NvxBAAL8ej28N/77Nn++NkR+toY8tUQ9NMQ5tj0APwJ7eD16dr3/dwbE+UxFuExDdwq+9Yg7NkC+vQB6Nrz8N0FEeUtMfs5OA06MwI4FeIt+t4Z+PH/69719OANDuYqMP03Og86OhI6K/g4C+gm+vMB9Oj7/OoQDuUtIvIvNgY5OQ06J/I2B+oi/PUE/PED/+8NBOUhEegtH/AxIfI0Few0AOsd//kIAPgI/vQJ+OYM+uQXBegoBukqAuwf/vEO'],
    '가디언 엔젤 슬라임': ['/Ar7Ag392evxzOPpyubpDRXg7wPnx9feyNjdEx71EBzzzO/02fz+7AwBICDeEh7kyefpx9jgFh7rCRvsx/z96BX/BCQBIB7eISDgyO3xx97n9hHxBBz0CB/6FCzr6yXuDB7dGBvl3Qb3xuTu5RADGiPuHCXqDB3eBCLfBhjdDBvxDyAP4Pz5ISMOFxTvIi3vEinjCx/g+Q/fASPzLDEkISIQDw7sCADyBxjgEiriAAjfEQr4/BPiDin+ER8ADxXqBRDgBh7gBx/gBxnfBxDhFB/zBCbr8xzsCyrkECrjDirjECriDyriDCvpEC35Ayvp8B3x'],
    '윌': ['/Pv//PsAAP4CCgkMBAEE+fHy7Ojt7Orz3dzkIx8eIR4cKCMgGxcXDgwPCf369+7v6Obv393lKSMhKSIfKSIfJiAdEA8QCQEAA/bz4d/m2djgGxgaIx4cKSIfHBgaFhMXBQIH/fLz5OHn4N7jCgcIFRAPKCIeFhEQCwYJ//kAAvj25eHk8OflDAgPDAUIGhAEHBULIBweGBEaFg4H6OLi/e/pFhAKHBQLIx0ZIhsUHRUOGQ8IBfjx8ejl4tzc5eLmFxMQKCEeKCEeIhwXDAT86eLezMvOysvS29TQ0dHS+/n4ExAPAfz20tHQy8vMysrQy8vV'],
    '루시드': ['H/4PHv0PHO8HFOD6FeD6FAQVIBMgCP0OBwAIHPIIJO4KIt8CE9z2Hd37KwskLBcsGAgbGw0bFOb+IN0BGtj7CdvvDdjzJ/cULBIpKxcrGwsaD97zHtj6FdX3AtftANjrBtTzGewPKx4rEwATAdrq/tP2AdH8/tfuBtzr5sza38jaJRckEgQS687c79DdANnrBt/u6Njg7bfl4sLYFvQPE/wO19DY88XoGQQLKB0fJSIkGfwNC+8AJPYeBe0FCwAEHBQWJSEfJSEhIx4fIyElAe0SBeYb7toEAOPvCfT7CvwEBf8DFAsPAQAO2Nry1tfy29jx'],
    '데미안': ['JhQfMBUjC/oI9uX0JvcL8ePyDO3/Fu0D++n3Nw4gMQYaJe8IB+b4Buf57t7sCOb68d/v9+X0OwQbNfcRHusE69/q6N3n5tzm6tzn/+L0EOsAK/ILQwEaLvcN6uLq6+Hp7t3n6d/nKfQLM/4UFusCLe8KHO0C9+TvBuDrBuTv++LsQgMbOwMdC+r6/ef4/uf27+Lr797nEubxCen1HOoAMgUiLfYC9eb07eTs8ufs6d/n8uPs/ebwLPUXNwUjDvcEJObxGun2IP4HFvQFDO/+HfIIVQ5GNvgT/uz5+OPsGuXuG+TuFeTwHef1SAk0XAxFOPIN']
  };
  function decodeSig(b64) {
    var bin = atob(b64), v = new Array(bin.length);
    for (var i = 0; i < bin.length; i++) { var c = bin.charCodeAt(i); v[i] = c > 127 ? c - 256 : c; }
    return normalize(v);
  }

  // 난이도 배지 색. HARD는 분홍 배경, EXTREME은 검은 배경에 같은 계열의 붉은 글자라
  // 붉은 픽셀이 배지 칸을 얼마나 덮는지(배경 ≈ 45%, 글자 ≈ 17%)로 가른다.
  var DIFF_LABEL = { easy: '이지', normal: '노멀', hard: '하드', chaos: '카오스', extreme: '익스트림' };
  function badgeClass(r, g, b) {
    if (r > 140 && g < 100 && r - g > 80) return 'red';                          // HARD 배경 / EXTREME 글자
    if (g > 130 && b > 140 && r < 90) return 'normal';                           // 청록 배경
    if (Math.abs(r - g) < 10 && Math.abs(g - b) < 10 && r >= 85 && r <= 125) return 'easy'; // 회색 배경
    if (r > 150 && g > 125 && b > 95 && r - b > 30 && g - b > 15) return 'chaos'; // 검은 배경 + 금색 글자
    return '';
  }

  // ── 픽셀 도구 ───────────────────────────────────────────────
  function colorAt(img, x, y) {
    var i = (y * img.width + x) * 4, d = img.data;
    return [d[i], d[i + 1], d[i + 2]];
  }
  function dist(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }
  // 가장 흔한 색(채널당 상위 5비트로 묶어서 센다).
  function modeColor(img, x0, y0, x1, y1) {
    var counts = new Map(), best = null, bestN = 0, d = img.data;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var i = (y * img.width + x) * 4;
      var key = (d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3);
      var e = counts.get(key);
      if (!e) { e = { n: 0, r: 0, g: 0, b: 0 }; counts.set(key, e); }
      e.n++; e.r += d[i]; e.g += d[i + 1]; e.b += d[i + 2];
      if (e.n > bestN) { bestN = e.n; best = e; }
    }
    return best ? [best.r / best.n, best.g / best.n, best.b / best.n] : [0, 0, 0];
  }

  // ── ① 카드 찾기 ─────────────────────────────────────────────
  // 페이지 배경과 다른 픽셀을 8방향으로 이은 덩어리 중, 카드 테두리가 만든
  // '같은 크기의 세로로 긴 사각형'만 카드로 본다.
  function components(img, bg) {
    var w = img.width, h = img.height, n = w * h, d = img.data;
    var mask = new Uint8Array(n);
    for (var i = 0; i < n; i++) {
      var j = i * 4;
      mask[i] = Math.max(Math.abs(d[j] - bg[0]), Math.abs(d[j + 1] - bg[1]), Math.abs(d[j + 2] - bg[2])) > 14 ? 1 : 0;
    }
    var seen = new Uint8Array(n), stack = new Int32Array(n), out = [];
    for (var s = 0; s < n; s++) {
      if (!mask[s] || seen[s]) continue;
      var sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = s; seen[s] = 1;
      while (sp) {
        var p = stack[--sp], x = p % w, y = (p - x) / w;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            var q = yy * w + xx;
            if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
          }
        }
      }
      if (x1 - x0 >= 15 && y1 - y0 >= 15) out.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return out;
  }
  function findCards(img) {
    var bg = modeColor(img, 0, 0, img.width - 1, img.height - 1);
    var comps = components(img, bg);
    // 카드 비율(세로/가로 ≈ 1.9) 근처에서 가장 많이 나온 크기를 카드 크기로 잡는다.
    var tally = new Map(), best = null, bestN = 0;
    comps.forEach(function (c) {
      var ratio = c.h / c.w;
      if (c.w < 24 || ratio < 1.4 || ratio > 2.4) return;
      var key = c.w + 'x' + c.h, n = (tally.get(key) || 0) + 1;
      tally.set(key, n);
      if (n > bestN) { bestN = n; best = c; }
    });
    if (!best) return { bg: bg, cards: [], comps: comps };
    var cards = comps.filter(function (c) {
      return Math.abs(c.w - best.w) <= Math.max(2, best.w * 0.04) && Math.abs(c.h - best.h) <= Math.max(2, best.h * 0.04);
    });
    // 위→아래, 같은 줄이면 왼→오른.
    cards.sort(function (a, b) { return Math.abs(a.y - b.y) > best.h / 2 ? a.y - b.y : a.x - b.x; });
    return { bg: bg, cards: cards, comps: comps };
  }
  // 초상화가 테두리와 떨어진 카드에서 초상화 위치를 재서 전체에 쓴다.
  function portraitGeometry(cards, comps) {
    var xs = [], ys = [], ws = [], hs = [];
    cards.forEach(function (c) {
      comps.forEach(function (p) {
        if (p.x <= c.x || p.y <= c.y || p.x + p.w >= c.x + c.w || p.y + p.h >= c.y + c.h) return;
        if (p.w < c.w * 0.6 || p.w > c.w * 0.9 || Math.abs(p.h - p.w) > p.w * 0.1) return;
        xs.push((p.x - c.x) / c.w); ys.push((p.y - c.y) / c.w); ws.push(p.w / c.w); hs.push(p.h / c.w);
      });
    });
    function median(a, fallback) {
      if (!a.length) return fallback;
      a.sort(function (p, q) { return p - q; });
      return a[a.length >> 1];
    }
    return {
      x: median(xs, PORTRAIT.x / BASE_CARD_W), y: median(ys, PORTRAIT.y / BASE_CARD_W),
      w: median(ws, PORTRAIT.w / BASE_CARD_W), h: median(hs, PORTRAIT.h / BASE_CARD_W)
    };
  }
  function portraitBox(card, geo) {
    return {
      x: card.x + geo.x * card.w, y: card.y + geo.y * card.w,
      w: geo.w * card.w, h: geo.h * card.w
    };
  }

  // ── ② 보스 판별 ─────────────────────────────────────────────
  // 칸 평균색 벡터. 왼쪽 위(LV/S/F 동그라미)와 아래(난이도 배지)는 가려지므로 뺀다.
  function cellUsed(gx, gy) { return gx >= 3 && gy < GRID - 3; }
  function signature(img, box) {
    var v = [];
    for (var gy = 0; gy < GRID; gy++) for (var gx = 0; gx < GRID; gx++) {
      if (!cellUsed(gx, gy)) continue;
      var x0 = Math.floor(box.x + box.w * gx / GRID), x1 = Math.max(x0, Math.ceil(box.x + box.w * (gx + 1) / GRID) - 1);
      var y0 = Math.floor(box.y + box.h * gy / GRID), y1 = Math.max(y0, Math.ceil(box.y + box.h * (gy + 1) / GRID) - 1);
      var r = 0, g = 0, b = 0, n = 0;
      for (var y = Math.max(0, y0); y <= Math.min(img.height - 1, y1); y++) {
        for (var x = Math.max(0, x0); x <= Math.min(img.width - 1, x1); x++) {
          var p = colorAt(img, x, y); r += p[0]; g += p[1]; b += p[2]; n++;
        }
      }
      n = n || 1;
      v.push(r / n, g / n, b / n);
    }
    return normalize(v);
  }
  function normalize(v) {
    var mean = 0, i;
    for (i = 0; i < v.length; i++) mean += v[i];
    mean /= v.length;
    var norm = 0;
    for (i = 0; i < v.length; i++) { v[i] -= mean; norm += v[i] * v[i]; }
    norm = Math.sqrt(norm) || 1;
    for (i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  }
  function similarity(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }
  // 캡처 쪽 초상화는 아이콘을 얼굴 쪽으로 확대해 자른 그림이라,
  // 아이콘을 여러 배율·위치로 잘라 둔 서명 중 가장 비슷한 것으로 비교한다.
  var ZOOMS = [1, 1.12, 1.25, 1.4, 1.55, 1.7];
  var STEPS = 7;
  function refSignatures(img) {
    var W = img.width, H = img.height, d = img.data;
    // 채널별 누적합(SAT)으로 칸 평균을 바로 구한다.
    var sat = [0, 1, 2].map(function () { return new Float64Array((W + 1) * (H + 1)); });
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4, o = (y + 1) * (W + 1) + x + 1;
      for (var c = 0; c < 3; c++) sat[c][o] = d[i + c] + sat[c][o - 1] + sat[c][o - W - 1] - sat[c][o - W - 2];
    }
    function boxAvg(c, x0, y0, x1, y1) { // [x0,x1) × [y0,y1), 정수 좌표
      var s = sat[c], w1 = W + 1;
      var area = Math.max(1, (x1 - x0) * (y1 - y0));
      return (s[y1 * w1 + x1] - s[y0 * w1 + x1] - s[y1 * w1 + x0] + s[y0 * w1 + x0]) / area;
    }
    var sigs = [];
    ZOOMS.forEach(function (z) {
      var bw = W / z, bh = H / z;
      var nx = z === 1 ? 1 : STEPS, ny = z === 1 ? 1 : STEPS;
      for (var iy = 0; iy < ny; iy++) for (var ix = 0; ix < nx; ix++) {
        var bx = nx > 1 ? (W - bw) * ix / (nx - 1) : 0, by = ny > 1 ? (H - bh) * iy / (ny - 1) : 0;
        var v = [];
        for (var gy = 0; gy < GRID; gy++) for (var gx = 0; gx < GRID; gx++) {
          if (!cellUsed(gx, gy)) continue;
          var x0 = Math.round(bx + bw * gx / GRID), x1 = Math.max(x0 + 1, Math.round(bx + bw * (gx + 1) / GRID));
          var y0 = Math.round(by + bh * gy / GRID), y1 = Math.max(y0 + 1, Math.round(by + bh * (gy + 1) / GRID));
          v.push(boxAvg(0, x0, y0, x1, y1), boxAvg(1, x0, y0, x1, y1), boxAvg(2, x0, y0, x1, y1));
        }
        sigs.push(normalize(v));
      }
    });
    return sigs;
  }
  function matchBoss(sig, refs) {
    var best = null, bestS = -2, second = -2;
    refs.forEach(function (r) {
      var s = -2;
      r.sigs.forEach(function (rs) { var t = similarity(sig, rs); if (t > s) s = t; });
      if (s > bestS) { second = bestS; bestS = s; best = r; } else if (s > second) second = s;
    });
    return { ref: bestS >= 0.5 ? best : null, score: bestS, margin: bestS - second };
  }

  // ── ③ 난이도 ───────────────────────────────────────────────
  function readDiff(img, box) {
    var counts = { red: 0, normal: 0, easy: 0, chaos: 0 }, total = 0;
    var x0 = Math.round(box.x + box.w * 0.3), x1 = Math.round(box.x + box.w) - 1;
    var y0 = Math.round(box.y + box.h * 0.77), y1 = Math.round(box.y + box.h * 0.92);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var p = colorAt(img, x, y), k = badgeClass(p[0], p[1], p[2]);
      total++;
      if (k) counts[k]++;
    }
    var f = function (k) { return counts[k] / (total || 1); };
    if (f('red') >= 0.3) return 'hard';
    if (f('normal') >= 0.15) return 'normal';
    if (f('easy') >= 0.15) return 'easy';
    if (f('red') >= 0.08) return 'extreme';
    if (f('chaos') >= 0.05) return 'chaos';
    return '';
  }

  // ── ④ 배율 숫자 ─────────────────────────────────────────────
  // 카드 맨 아래 글자 줄을 8px 높이로 맞춘 뒤, 글자 템플릿을 왼쪽부터 이어 붙여
  // 차이가 가장 적은 배치를 찾는다(붙어 있는 글자도 나눠진다).
  function readPercent(img, card, top) {
    var s = card.w / BASE_CARD_W;
    var bgc = modeColor(img, card.x + 3, Math.round(card.y + card.h - 9 * s), card.x + card.w - 4, Math.round(card.y + card.h - 5 * s));
    var x0 = card.x + Math.round(4 * s), x1 = card.x + card.w - 1 - Math.round(4 * s);
    var y0 = Math.round(top), y1 = card.y + card.h - 1 - Math.round(4 * s);
    var ink = function (x, y) { return dist(colorAt(img, x, y), bgc) > 80 ? 1 : 0; };
    var rowInk = [];
    for (var y = y0; y <= y1; y++) {
      var n = 0;
      for (var x = x0; x <= x1; x++) n += ink(x, y);
      rowInk.push(n);
    }
    var e = rowInk.length - 1;
    while (e >= 0 && !rowInk[e]) e--;
    if (e < 0) return { text: '', value: null };
    var b = e;
    while (b > 0 && rowInk[b - 1]) b--;
    var ly0 = y0 + b, ly1 = y0 + e, lh = ly1 - ly0 + 1;
    if (lh < GLYPH_H * s * 0.75 || lh > GLYPH_H * s * 1.25) return { text: '', value: null };
    var lx0 = x1, lx1 = x0;
    for (y = ly0; y <= ly1; y++) for (x = x0; x <= x1; x++) if (ink(x, y)) { if (x < lx0) lx0 = x; if (x > lx1) lx1 = x; }
    // 잉크 진하기(0~1). 1배 캡처는 사실상 0/1이고, 확대 캡처의 흐린 가장자리는 중간값이 된다.
    var W = lx1 - lx0 + 1, H = lh, soft = new Float32Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      soft[y * W + x] = Math.min(1, Math.max(0, (dist(colorAt(img, lx0 + x, ly0 + y), bgc) - 30) / 100));
    }
    var text = parseLine(soft, W, H, H / GLYPH_H);
    var m = /^(\d+(?:\.\d+)?)%$/.exec(text || '');
    return { text: text || '', value: m ? parseFloat(m[1]) : null };
  }
  // 글자 템플릿을 (w × h)로 늘린 진하기 표(겹치는 면적 비율로 칠한다).
  var scaledCache = new Map();
  function scaledTemplate(t, w, h) {
    var key = t.ch + ':' + w + 'x' + h;
    if (scaledCache.has(key)) return scaledCache.get(key);
    var out = new Float32Array(w * h), kx = t.w / w, ky = GLYPH_H / h;
    for (var Y = 0; Y < h; Y++) for (var X = 0; X < w; X++) {
      var sx0 = X * kx, sx1 = (X + 1) * kx, sy0 = Y * ky, sy1 = (Y + 1) * ky, sum = 0;
      for (var y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        var oy = Math.min(sy1, y + 1) - Math.max(sy0, y);
        for (var x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          var ox = Math.min(sx1, x + 1) - Math.max(sx0, x);
          sum += t.bits[y * t.w + x] * ox * oy;
        }
      }
      out[Y * w + X] = sum / (kx * ky);
    }
    scaledCache.set(key, out);
    return out;
  }
  // 왼쪽부터 글자 템플릿을 이어 붙여 차이가 가장 적은 배치를 찾는다(DP).
  // s는 기준 글꼴 대비 배율. 차이는 기준 글꼴의 칸 수로 환산해 비교한다.
  // 그 사이트는 유효숫자 4자리로 적는다(0.42% · 10.19% · 143.1% · 1348% · 12081%).
  // 정수부 자릿수에 맞는 소수 자릿수를 상태로 강제해 흐린 틈에 점이 끼어들지 않게 한다.
  //  0 시작 · 1~3 정수 1~3자리 · 4 정수 4자리 이상
  //  5~7 소수 2자리 필요(0·1·2자리 읽음) · 8~9 소수 1자리 필요(0·1자리 읽음) · 10 % 뒤(끝)
  var NEXT = {
    digit: [1, 2, 3, 4, 4, 6, 7, -1, 9, -1, -1],
    '.': [-1, 5, 5, 8, -1, -1, -1, -1, -1, -1, -1],
    '%': [-1, -1, -1, -1, 10, -1, -1, 10, -1, 10, -1]
  };
  var NS = 11, END = 10;
  var DOT_PENALTY = 0;
  function parseLine(soft, W, H, s) {
    var area = s * s;
    var colInk = new Float64Array(W);
    for (var x = 0; x < W; x++) for (var y = 0; y < H; y++) colInk[x] += soft[y * W + x];
    var cost = new Float64Array((W + 1) * NS).fill(Infinity), from = new Int32Array((W + 1) * NS), pick = new Array((W + 1) * NS);
    cost[0] = 0;
    function relax(i, st, j, nst, c, ch) {
      var a = j * NS + nst;
      if (c < cost[a]) { cost[a] = c; from[a] = i * NS + st; pick[a] = ch; }
    }
    for (var i = 0; i < W; i++) for (var st = 0; st < NS; st++) {
      var here = cost[i * NS + st];
      if (here === Infinity) continue;
      // 빈 칸 건너뛰기(칠해진 칸을 건너뛰면 크게 손해).
      relax(i, st, i + 1, st, here + colInk[i] * 3 / area, null);
      TEMPLATES.forEach(function (t) {
        var nst = NEXT[t.ch === '.' || t.ch === '%' ? t.ch : 'digit'][st];
        if (nst < 0) return;
        var base = Math.max(1, Math.round(t.w * s));
        [base - 1, base, base + 1].forEach(function (wt) {
          if (wt < 1) return;
          var tpl = scaledTemplate(t, wt, H);
          // 글자 사이가 0칸이면 그대로 붙고, '77'처럼 1칸 겹치기도 한다.
          // 겹칠 때는 마지막 열을 다음 글자에게 맡기고 나머지만 비교한다.
          var spans = t.w >= 4 ? [wt, wt - Math.max(1, Math.round(s))] : [wt];
          spans.forEach(function (span) {
            if (span < 1 || i + span > W) return;
            var miss = 0;
            for (var y = 0; y < H; y++) for (var x = 0; x < span; x++) miss += Math.abs(tpl[y * wt + x] - soft[y * W + i + x]);
            miss /= area;
            if (miss > Math.max(2, t.w * GLYPH_H * 0.3)) return;
            // 점 자리는 아래 1/4에만 잉크가 있고 위쪽은 비어 있어야 한다(흐린 틈과 구별).
            if (t.ch === '.') {
              var low = 0, high = 0;
              for (y = 0; y < H; y++) for (x = 0; x < span; x++) {
                var v = soft[y * W + i + x];
                if (y >= H * 0.75) low += v; else if (y < H * 0.6) high += v;
              }
              if (low < 0.5 * area || high > low * 0.25) return;
            }
            // 점은 한 칸짜리라 흐린 틈에도 싸게 맞아 버리므로 벌점을 더 준다.
            var penalty = (span === wt ? 0.5 : 2.5) + (t.ch === '.' ? DOT_PENALTY : 0);
            relax(i, st, i + span, nst, here + miss + penalty, t.ch);
          });
        });
      });
    }
    var end = W * NS + END;
    if (cost[end] === Infinity) return '';
    var out = [];
    for (var p = end; p > 0; p = from[p]) if (pick[p]) out.push(pick[p]);
    return out.reverse().join('');
  }

  // ── 전체 ───────────────────────────────────────────────────
  function analyze(img, refs) {
    var found = findCards(img);
    var geo = portraitGeometry(found.cards, found.comps);
    var out = found.cards.map(function (card) {
      var box = portraitBox(card, geo);
      var boss = refs && refs.length ? matchBoss(signature(img, box), refs) : { ref: null, score: 0, margin: 0 };
      var diff = readDiff(img, box);
      var pct = readPercent(img, card, box.y + box.h);
      return {
        card: card, portrait: box,
        name: boss.ref ? boss.ref.name : '', icon: boss.ref ? boss.ref.icon : '', score: boss.score, margin: boss.margin,
        sure: !!boss.ref && boss.score >= 0.7 && boss.margin >= 0.05,
        diffKey: diff, diff: DIFF_LABEL[diff] || '',
        text: pct.text, value: pct.value, scale: card.w / BASE_CARD_W
      };
    });
    // 같은 보스·난이도가 두 장 나오면(아이콘에 없는 다른 그림이 끼어든 경우) 덜 닮은 쪽을 의심한다.
    var seen = Object.create(null);
    out.slice().sort(function (a, b) { return b.score - a.score; }).forEach(function (r) {
      if (!r.name || !r.diff) return;
      var key = r.name + '|' + r.diff;
      if (seen[key]) r.sure = false; else seen[key] = true;
    });
    return out;
  }

  // ── 브라우저 쪽 입출력 ──────────────────────────────────────
  function toImageData(source, maxSide) {
    var w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
    var k = maxSide && Math.max(w, h) > maxSide ? maxSide / Math.max(w, h) : 1;
    var c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    var g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height);
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { reject(new Error('이미지를 열 수 없습니다.')); };
      im.src = src;
    });
  }
  var refCache = new Map();
  // icons: [{ name, icon }] — icon은 사이트 보스 아이콘 경로.
  function loadRefs(icons) {
    return Promise.all(icons.map(function (b) {
      if (refCache.has(b.icon)) return refCache.get(b.icon);
      var site = (SITE_PORTRAITS[b.name] || []).map(decodeSig);
      // 페이지를 file://로 열면 아이콘 픽셀을 읽을 수 없다(캔버스 보안 제한).
      // 그때도 사이트 초상화 서명만으로는 비교할 수 있게 남겨 둔다.
      var p = loadImage(b.icon).then(function (im) {
        return refSignatures(toImageData(im, 128));
      }).catch(function () { return []; }).then(function (iconSigs) {
        var sigs = site.concat(iconSigs);
        return sigs.length ? { name: b.name, icon: b.icon, sigs: sigs } : null;
      });
      refCache.set(b.icon, p);
      return p;
    })).then(function (list) { return list.filter(Boolean); });
  }
  // file: 붙여넣거나 고른 이미지(Blob). 결과는 카드 순서대로.
  function readBlob(file, icons) {
    var url = URL.createObjectURL(file);
    return Promise.all([loadImage(url), loadRefs(icons)]).then(function (r) {
      var im = r[0], list = analyze(toImageData(im), r[1]);
      // 미리보기에서 눈으로 확인할 수 있게 카드 초상화를 작게 잘라 둔다.
      var c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = c.height = 60;
      list.forEach(function (it) {
        var b = it.portrait;
        g.clearRect(0, 0, 60, 60);
        g.drawImage(im, b.x, b.y, b.w, b.h, 0, 0, 60, 60);
        it.thumb = c.toDataURL('image/jpeg', 0.8);
      });
      return list;
    }).finally(function () { URL.revokeObjectURL(url); });
  }

  root.BossShotReader = {
    readBlob: readBlob,
    analyze: analyze,
    findCards: findCards,
    loadRefs: loadRefs,
    // 아이콘 없이 사이트 초상화 서명만으로 만든 비교 대상(테스트용).
    siteRefs: function () {
      return Object.keys(SITE_PORTRAITS).map(function (name) {
        return { name: name, icon: '', sigs: SITE_PORTRAITS[name].map(decodeSig) };
      });
    },
    parseLine: parseLine,
    DIFF_LABEL: DIFF_LABEL
  };
})(typeof window !== 'undefined' ? window : globalThis);
