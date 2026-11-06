# E2E plan — Run B: legacy record migration (2026-11-04)

Old JS = commit ab60131 (pre-Run-A, anitabi ids) served from a temp worktree; new JS = working tree (Run A committed +
Run B uncommitted). Same dev-client native build, same simulator app container (no reinstall between old and new).

Baseline: uninstall + reinstall the app so storage is empty.

| ID | Steps (old JS) | Expected after switching to new JS | Verified at |
|---|---|---|---|
| M-a | 氷菓 work page: mark 2 spots visited | Both visited marks moved to the Atlas spot ids within 50 m (same 氷菓 spots show 已去, count 2) | 氷菓 work page "去過 N" + spot circles |
| M-b | 氷菓: save 1 spot (saved intent) | Saved flag on the matching Atlas spot | saved list / spot menu |
| M-c | Import a library photo as a capture at one 氷菓 spot | Album shows the photo under the Atlas spot name; photo file still opens | 足跡/album |
| M-d | (if available) a spot with no Atlas match within 50 m | Kept, labelled 舊景點 | album |
| M-e | Relaunch new JS a second time | Nothing changes (idempotent), no duplicates | same screens |

Pre-existing values recorded before the switch: screenshots of the old app (spot names, visited count, album).
