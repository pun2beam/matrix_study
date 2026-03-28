# matrix_study

2×2行列の理解支援Webアプリです。`SPECIFICATION.md` の要件を満たすように、GitHub Pages でそのまま公開できる静的ファイル構成で実装しています。

## ファイル構成

- `index.html`: UI（行列入力、表示切替、結果表示、Canvas）
- `styles.css`: レイアウトと配色
- `app.js`: 計算ロジック、描画ロジック、ドラッグ操作
- `SPECIFICATION.md`: 仕様書

## ローカル確認

任意の静的サーバで表示できます。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000/` を開いてください。

## GitHub Pagesで公開

1. このリポジトリを GitHub に push
2. GitHub の **Settings → Pages** を開く
3. **Build and deployment** の **Source** を `Deploy from a branch` に設定
4. Branch に `main`（または利用ブランチ） / Folder に `/ (root)` を指定
5. 保存後、表示される公開URLにアクセス

ビルド工程なしで公開されます。
