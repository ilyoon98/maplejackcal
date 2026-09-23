// 이 파일은 CoinShopData.xlsx에서 자동으로 만들어진다. 직접 고치지 말고 xlsx를 고친 뒤
//   node tools/build_coin_shop_data.js
// 를 실행한다 (Vercel 배포 때는 자동 실행).
window.COIN_SHOP_EVENTS = [
  {
    id: "event-1", name: "프로텍트 아르고",
    startDate: "2026-09-17", endDate: "2026-11-18", weeks: 8, perWeek: 5000,
    tabs: [{"key":"type-1","label":"강화"},{"key":"type-2","label":"성장"}],
    shop: {
      "type-1": [
        {"id":"item-1","name":"카르마 브론즈 에디셔널 큐브","price":100,"stock":100,"limit":"M","icon":"🪙","img":["브론즈.webp"]},
        {"id":"item-2","name":"카르마 실버 큐브","price":100,"stock":100,"limit":"M","icon":"🪙","img":["실버.webp"]},
        {"id":"item-3","name":"에픽 잠재능력 부여 스크롤 100%","price":300,"stock":5,"limit":"M","icon":"🪙","img":["에픽잠재.webp"]},
        {"id":"item-4","name":"스페셜 에디셔널 잠재능력 부여 스크롤 100%","price":300,"stock":5,"limit":"M","icon":"🪙","img":["스페셜에디.webp"]},
        {"id":"item-5","name":"이노센트 주문서 100%","price":100,"stock":20,"limit":"M","icon":"🪙","img":["이노센트.webp"]},
        {"id":"item-6","name":"펫장비 주문서 선택권","price":500,"stock":20,"limit":"M","icon":"🪙","img":["펫장비 공주문서.webp","펫장비 마주문서.webp"]},
        {"id":"item-7","name":"순백의 주문서 100%","price":200,"stock":10,"limit":"M","icon":"🪙","img":["순백100.webp"]},
        {"id":"item-8","name":"이벤트 링 선택권","price":3000,"stock":3,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-9","name":"이벤트 링 전용 골드 큐브","price":150,"stock":100,"limit":"M","icon":"🪙","img":["골드.webp"]},
        {"id":"item-10","name":"이벤트 링 전용 레전드리 잠재능력 부여 스크롤","price":4000,"stock":2,"limit":"M","icon":"🪙","img":["이벤트 레전 잠재.webp"]},
        {"id":"item-11","name":"카르마 유니크 잠재능력 부여 스크롤 100%","price":3000,"stock":4,"limit":"M","icon":"🪙","img":["유니크.webp"]},
        {"id":"item-12","name":"카르마 에디셔널 에픽 잠재능력 부여 스크롤","price":3000,"stock":4,"limit":"M","icon":"🪙","img":["에디에픽잠재.webp"]},
        {"id":"item-13","name":"카르마 스페셜 하트 주문서 선택권","price":2000,"stock":10,"limit":"M","icon":"🪙","img":["스페셜하트 공주문서.webp","스페셜하트 맞주문서.webp"]}
      ],
      "type-2": [
        {"id":"item-14","name":"AP 초기화 주문서","price":50,"stock":3,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-15","name":"SP 초기화 주문서","price":50,"stock":3,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-16","name":"의문의 모몽","price":300,"stock":40,"limit":"W","icon":"🪙","img":[]},
        {"id":"item-17","name":"성향 성장의 비약","price":300,"stock":20,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-18","name":"선택 슬롯 8칸 확장권","price":100,"stock":15,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-19","name":"무한의 피로회복제","price":10,"stock":5,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-20","name":"캐릭터 슬롯 증가 쿠폰","price":200,"stock":5,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-21","name":"경험의 코어 젬스톤","price":150,"stock":200,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-22","name":"카오스 서큘레이터","price":800,"stock":20,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-23","name":"블랙 서큘레이터","price":1500,"stock":10,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-24","name":"레전드리 서큘레이터","price":2000,"stock":3,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-25","name":"슈피겔라의 황금 딸기 농장 1회 입장권","price":200,"stock":5,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-26","name":"익스트림 성장의 비약","price":70,"stock":200,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-27","name":"성장의 비약 (200~249)","price":5000,"stock":2,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-28","name":"성장의 비약 (200~259)","price":10000,"stock":1,"limit":"M","icon":"🪙","img":[]},
        {"id":"item-29","name":"솔 에르다","price":8000,"stock":3,"limit":"M","icon":"🪙","img":[]}
      ]
    }
  }
];
