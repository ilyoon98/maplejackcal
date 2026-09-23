// 이벤트 코인샵 데이터. 이벤트가 바뀌면 이 파일만 고친다.
// - id: 저장 키에 붙는다. 이벤트가 바뀌면 id도 바꿔야 지난 이벤트의 장바구니가 섞이지 않는다.
// - startDate: 1주차 시작일(YYYY-MM-DD). 오늘 날짜로 현재 주차를 자동 계산하는 데 쓴다. 없으면 수동.
// - perWeek/weeks: 주당 코인과 기간(주). 페이지에서 바꿀 수 없다.
// - shop: 탭별 품목. price = 코인 개수, stock = 상점의 "남은 수량" 표기값(= 구매 제한),
//   limit: 'M' = 메이플ID 기준 제한, 'W' = 월드 기준 제한, img: icons/CoinShop/ 폴더의 파일명(없으면 icon 이모지)
window.COIN_SHOP_EVENT = {
  id: 'argo-2026-fall',
  name: '아르고 주화 상점',
  season: '2026 가을',
  updatedAt: '2026-09-23',
  coinName: '아르고 주화',
  // 1주차가 시작한 날(목요일). 매주 목요일에 다음 주차로 넘어간다. 페이지가 오늘 날짜로 현재 주차를 계산한다.
  startDate: '2026-09-17',
  perWeek: 5000,
  weeks: 8,
  tabs: [
    { key: 'enhance', label: '강화' },
    { key: 'growth',  label: '성장' }
  ],
  shop: {
    enhance: [
      { id:'karma-bronze-add-cube',  name:'카르마 브론즈 에디셔널 큐브',              price:100,   stock:100, limit:'M', icon:'🧊', img:'브론즈.webp' },
      { id:'karma-silver-cube',      name:'카르마 실버 큐브',                         price:100,   stock:100, limit:'M', icon:'🧊', img:'실버.webp' },
      { id:'epic-pot-scroll',        name:'에픽 잠재능력 부여 스크롤 100%',           price:300,   stock:5,   limit:'M', icon:'📜', img:'에픽잠재.png' },
      { id:'special-add-pot-scroll', name:'스페셜 에디셔널 잠재능력 부여 스크롤 100%', price:300,   stock:5,   limit:'M', icon:'📜', img:'스페셜에디.webp' },
      { id:'innocent-scroll',        name:'이노센트 주문서 100%',                     price:100,   stock:20,  limit:'M', icon:'📜', img:'이노센트.png' },
      // 선택권은 고를 수 있는 주문서가 둘이라 아이콘도 둘 다 보여준다
      { id:'pet-equip-scroll-box',   name:'펫장비 주문서 선택권',                     price:500,   stock:20,  limit:'M', icon:'🐾', img:['펫장비 공주문서.png','펫장비 마주문서.png'] },
      { id:'pure-white-scroll',      name:'순백의 주문서 100%',                       price:200,   stock:10,  limit:'M', icon:'📜', img:'순백100.png' },
      { id:'event-ring-box',         name:'이벤트 링 선택권',                         price:3000,  stock:3,   limit:'M', icon:'💍' },
      { id:'event-ring-gold-cube',   name:'이벤트 링 전용 골드 큐브',                 price:150,   stock:100, limit:'M', icon:'🧊', img:'골드.webp' },
      { id:'event-ring-leg-scroll',  name:'이벤트 링 전용 레전드리 잠재능력 부여 스크롤', price:4000, stock:2, limit:'M', icon:'📜', img:'이벤트 레전 잠재.png' },
      { id:'karma-unique-scroll',    name:'카르마 유니크 잠재능력 부여 스크롤 100%',  price:3000,  stock:4,   limit:'M', icon:'📜', img:'유니크.png' },
      { id:'karma-add-epic-scroll',  name:'카르마 에디셔널 에픽 잠재능력 부여 스크롤', price:3000,  stock:4,   limit:'M', icon:'📜', img:'에디에픽잠재.webp' },
      { id:'karma-heart-scroll-box', name:'카르마 스페셜 하트 주문서 선택권',         price:2000,  stock:10,  limit:'M', icon:'💖', img:['스페셜하트 공주문서.png','스페셜하트 맞주문서.png'] }
    ],
    growth: [
      { id:'ap-reset',          name:'AP 초기화 주문서',                     price:50,    stock:3,   limit:'M', icon:'🔄' },
      { id:'sp-reset',          name:'SP 초기화 주문서',                     price:50,    stock:3,   limit:'M', icon:'🔄' },
      { id:'mysterious-momong', name:'의문의 모몽',                          price:300,   stock:40,  limit:'W', icon:'🐷' },
      { id:'trait-potion',      name:'성향 성장의 비약',                     price:300,   stock:20,  limit:'M', icon:'🧪' },
      { id:'slot-expand-8',     name:'선택 슬롯 8칸 확장권',                 price:100,   stock:15,  limit:'M', icon:'🎒' },
      { id:'infinite-fatigue',  name:'무한의 피로회복제',                    price:10,    stock:5,   limit:'M', icon:'🍵' },
      { id:'char-slot-coupon',  name:'캐릭터 슬롯 증가 쿠폰',                price:200,   stock:5,   limit:'M', icon:'🎫' },
      { id:'core-gemstone',     name:'경험의 코어 젬스톤',                   price:150,   stock:200, limit:'M', icon:'💠' },
      { id:'chaos-circulator',  name:'카오스 서큘레이터',                    price:800,   stock:20,  limit:'M', icon:'⚙️' },
      { id:'black-circulator',  name:'블랙 서큘레이터',                      price:1500,  stock:10,  limit:'M', icon:'⚙️' },
      { id:'legend-circulator', name:'레전드리 서큘레이터',                  price:2000,  stock:3,   limit:'M', icon:'⚙️' },
      { id:'strawberry-farm',   name:'슈피겔라의 황금 딸기 농장 1회 입장권', price:200,   stock:5,   limit:'M', icon:'🍓' },
      { id:'extreme-growth',    name:'익스트림 성장의 비약',                 price:70,    stock:200, limit:'M', icon:'🧪' },
      { id:'growth-200-249',    name:'성장의 비약 (200~249)',                price:5000,  stock:2,   limit:'M', icon:'🧪' },
      { id:'growth-200-259',    name:'성장의 비약 (200~259)',                price:10000, stock:1,   limit:'M', icon:'🧪' },
      { id:'sol-erda',          name:'솔 에르다',                            price:8000,  stock:3,   limit:'M', icon:'🔷' }
    ]
  }
};
