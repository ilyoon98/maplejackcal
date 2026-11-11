# 썬데이 메이플 디스코드 알림 (Cloudflare)

사이트와 독립된 예약 Worker입니다. 사이트의 HTML·배포·도메인은 변경하지 않습니다.

- 매주 금요일 **10:00 Asia/Seoul**에 이번 주 공지를 확인합니다.
- 일반 `썬데이 메이플`과 `스페셜 썬데이 메이플` 공지를 모두 지원합니다.
- 공지 미등록 또는 일시 오류 시 5분마다 재시도하고 **12:00**에 마지막으로 확인합니다.
- 넥슨이 공지를 10시 이후 등록하면 등록 후 첫 성공한 조회에서 발송합니다. 10시 정각 도착을 보장하지는 않습니다.
- Durable Object에 주차별 발송 결과를 보관하고 동시 실행을 직렬화합니다. 성공 후 같은 주차 예약은 전송하지 않습니다.
- 외부 HTTP 발송 진입점은 없습니다. 사이트 방문과 PC 실행 여부에 영향을 받지 않습니다.
- 조회/발송 오류와 정오까지 공지가 없는 경우 Cloudflare 실행 실패로 기록합니다. Cloudflare 대시보드에서 Logs를 확인합니다.

## 최초 설정과 배포

이 폴더에서 실행합니다. 루트 사이트에는 npm 설정을 추가하지 않습니다.

```powershell
npm ci
npx wrangler login
npm run check
npm run deploy
npx wrangler secret put NEXON_API_KEY
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret list
npx wrangler triggers deploy
```

`NEXON_API_KEY`는 기존 GitHub의 `MAPLE_API`에 넣었던 값,
`DISCORD_WEBHOOK_URL`은 기존 `DDUSCIRD_WEBHHOK_URL`에 넣었던 값입니다.
GitHub Secrets는 저장된 원문을 다시 읽을 수 없으므로 각각 다시 입력해야 합니다.
Cloudflare 대시보드의 Worker → Settings → Variables and Secrets에서도 **Secret** 형식으로 등록할 수 있습니다.
실제 값은 소스·채팅·커밋·사이트 폴더의 일반 파일에 넣지 않습니다.

`wrangler.jsonc`의 예약은 UTC 기준 `*/5 1-2 * * FRI`, `0 3 * * FRI`입니다.
Cloudflare의 요일 숫자는 일요일이 1이므로 GitHub의 숫자 5를 옮겨 쓰지 않고 `FRI`를 명시합니다.
예약 변경은 Cloudflare에 전파되기까지 최대 15분이 걸릴 수 있습니다.
최초 배포 및 비밀 설정 확인을 마친 뒤 기존 GitHub workflow의 `schedule`을 제거하여 중복을 막습니다.
수동 테스트 workflow는 남길 수 있지만 Cloudflare의 발송 기록과 공유되지 않습니다.

2026-10-30 전환: Worker 배포와 두 Secret 등록을 완료했습니다. 운영 Durable Object에서
이번 주 `스페셜 썬데이 메이플`(공지 1406)을 11:29 KST에 실제 발송하고, 재호출 시
`already-sent`로 중복이 차단되는 것을 확인했습니다. 기존 GitHub workflow는 원격에서
`disabled_manually`로 중지했습니다. 저장소의 workflow에는 예약을 제거하고 수동 테스트만 남겼습니다.

## 검증

저장소 루트에서:

```powershell
node --test tests/sunday-event.test.cjs tests/sunday-discord-worker.test.cjs
```

이 폴더에서 `npm run check`로 Worker 번들을 검증하고 `npm run logs`로 실제 실행 기록을 확인합니다.

일반적인 반복·동시 실행은 중복을 방지합니다. 다만 디스코드가 메시지를 수신한 직후 응답이 유실되거나
발송 기록 저장 전에 실행이 종료되면 다음 재시도에서 중복될 수 있습니다. 외부 웹후크와 저장소 간
단일 트랜잭션은 제공되지 않으므로 엄밀한 exactly-once 전송은 보장하지 않습니다.
