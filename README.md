# 咕咕日迹

日清单 / 跟办 / 日记 PWA。启用 GitHub Pages（Settings → Pages → Deploy from branch → `main` / `/ (root)`）后访问：

`https://jeffsu1228.github.io/gugu-riji/`

iPhone Safari：打开站点 → 分享 → 添加到主屏幕。

## 工作日记全文（加密）

- `data/diary.enc.json`：全部工作日记（含周记、月度工作记录）的密文，PBKDF2-SHA256（310000 次）→ AES-256-GCM。网站上不放任何明文日记；App 的「日记」「搜索」页输一次口令后在本机解密（WebCrypto），口令派生的密钥存在本机 localStorage，⚙ 设置里可「锁定 / 忘记口令」。
- 重建（加新日记后）：

  ```bash
  GUGU_RIJI_DIARY_PASS=… python3 tools/build_diary_enc.py /path/to/工作日记目录 [更多目录…]
  ```

  支持 .docx / .doc / .txt / .md，按日期一天一条（同日多版本合并）。默认沿用已有 salt，手机上不用重输口令；换口令加 `--new-salt`。口令只从环境变量读，不要写进仓库。

- 构建时自动剔除日记里每天滚动重抄的「未完成待办」类小节（二级小标题如「（五）未完成待办」「明日待办」「待办事项」「近期未完成」等，到下一个标题为止），避免一个待办词每天都被搜出来；正文、洞察建议、周记的「下周计划」保留。规则见 tools/build_diary_enc.py 的 `is_todo_head`。


## 勾选同步（GitHub 中转）

浏览器不能直打 Cursor webhook（CORS 仅放行 cursor.com）。路径：

1. App 用本机保存的 fine-grained token，把勾选 JSON 写入 `data/sync-queue.json`
2. GitHub Actions `relay-sync.yml` 读取该文件，用仓库 Secrets `GUGU_WEBHOOK_URL` / `GUGU_WEBHOOK_KEY` 服务端 POST 到「咕咕日迹勾选同步」Routine
3. 咕咕例程更新日清单记忆并推 Pages

App ⚙ 只填 GitHub token（Contents: Read and write，仅 `gugu-riji`）。不要把 webhook 密钥写进前端。
