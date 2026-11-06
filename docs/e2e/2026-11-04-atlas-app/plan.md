# E2E plan — Run A: pilgrimage feature reads only Atlas (2026-11-04)

Build: dev client + Metro on the working tree (uncommitted Run A diff). Device: iPhone 18 Pro simulator.
Data source: https://atlas.aniseekr.moe, dataVersion 20261104-6584d5e (bgm already live).

| ID | Goal | Steps | Expected | Verified at |
|---|---|---|---|---|
| A1 | Work page uses Atlas | Search 氷菓 → anime page → pilgrimage | Spots listed; count = Atlas `works/hyouka.json` spots (44, or the located subset if the UI only lists located ones); episode badges such as 第1話; no scene images; no "anitabi" text | Screenshot + accessibility tree vs curl of hyouka.json |
| A2 | Sequel resolves via prequel | Open ゆるキャン△ SEASON2 anime page → pilgrimage | Resolves to the Atlas work for Yuru Camp (key from works.json) with its spots; if no match, a real empty state (not someone else's spots) | Screenshot vs works.json key |
| A3 | Nearby | `simctl location set` Takayama 36.1408,137.2522 → pilgrimage hub nearby | Hyouka spots near Takayama listed with distances | Screenshot vs spots-lite rows near that point |
| A4 | Import reference | Spot → camera/compare → import screenshot (test PNG added via `simctl addmedia`) | Main CTA = import a screenshot; "Episode N · mm:ss" hint visible; after import, overlay shows the imported image | Screenshots |
| A5 | Credits | Settings → attribution | "Aniseekr Atlas" line; no anitabi | Accessibility tree |
| A6 | Logs | Metro log during A1–A5 | No requests to anitabi hosts; requests go to atlas.aniseekr.moe | Metro / network log |

Capture on the simulator has no camera → shutter capture is out of scope (UNVERIFIABLE here).
