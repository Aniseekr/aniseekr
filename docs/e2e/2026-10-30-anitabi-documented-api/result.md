# anitabi：只用 api.md 文件內端點（2026-10-30）

## 實際跑過的
出口 IP 在 `loc=TW`（cloudflare trace）。

1. `__tests__/integration/anitabi-live.test.ts`（PILG-013）：live `/lite` 回 200，`image.anitabi.cn` 封面回 200，content-type 是 image/*。
2. 直接用修改後的 `AnitabiClient` 打 live API（7157 ヨスガノソラ），全程只發出兩個請求：

```
200 https://api.anitabi.cn/bangumi/7157/lite
200 https://api.anitabi.cn/bangumi/7157/points/detail?haveImage=true
pointsLength 25 → /points/detail 17 筆 → normalize 後 17 筆
截圖 https://image.anitabi.cn/user/1099/bangumi/7157/points/…jpg?plan=h160 → 200 image/jpeg
origin「Anitabi@Xmなのだ」，有 originURL
```

3. `bun run typecheck`、`bun run spec:check`（239/239）、`bun run test:unit`（1703 pass / 0 fail）、改到的檔案跑 eslint，全部通過。

## 沒跑的
- 模擬器上 app 沒有實際開起來：iPhone 18 Pro 模擬器上沒有裝 dev build（被每小時的清理腳本清掉了），升 SDK 58 後要重 build native。巡禮作品頁的 UI 沒改，只改了 transport 層。
- 被 403 時的退讓只有 unit test 驗過，沒有在真的被擋的 IP 上測。
