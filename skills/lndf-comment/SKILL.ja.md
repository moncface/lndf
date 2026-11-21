---
name: lndf-comment
description: "コードを書く・変える時に、判断が発生した箇所へ LNDF コメント(@lndf: 4種)を置く規約。Write/Edit でソースコードを扱う全ての場面で適用する。"
---

# lndf-comment — コード内の判断継承

LNDF コメントは「なぜそうなったか」をコードに残す。「何をしているか」は書かない(コードを読めば分かる)。
置く場所は **判断が発生した行の直上** だけ。ファイル冒頭にまとめない。

判断の置き場は2つあり、同じ4種の語彙を使う。

| 置き場 | 残すもの | 寿命 |
|---|---|---|
| コード内コメント `@lndf:` | **その場所が**なぜそうなっているか | コードと共に(コードが消えれば消える) |
| コミットの trailer `LNDF-<kind>:` | **この変更が**なぜ起きたか、何を捨てたか | 履歴と共に(コードが消えても残る) |

制約(constraint)と数値(heuristic)は場所側が本籍、却下した代替案と暫定判断(why-not / temporal)は変更側が本籍。両方に同じことを書かない。trailer に `LNDF-heuristic` を書くのは、既存の数値を変えた時だけ(`LNDF-heuristic: 100ms -> 250ms | <変えた根拠>`)。新しく置いた数値はコメントだけでよい。

## 形式

```
// @lndf:<kind> <value> | <reason>
```

- 接頭辞 `@lndf:` は固定。言語に合わせてコメント記号だけ変える(`;` AHK, `#` Python, `--` SQL, `<!-- -->` HTML, `/* */`)
- `|` は1つ。左が値、右が理由
- 1判断1行。理由が長くなるなら右欄を短くし、詳細は spec か memory に置いてその ID を書く(`see memory:NNN`)。公開 repo では ID を書かない(「公開する repo」節)
- **本文は英語**

## kind(4種、閉集合)

| kind | 左欄(value) | 右欄(reason) | 置く場面 |
|---|---|---|---|
| `why-not` | 採らなかった案 | 採らなかった理由 | 複数案から選んだ時。既存資産から落とした項目もこれ |
| `constraint` | 制約の出所 | 制約の内容 | 外部要因(プラットフォーム、審査、法、契約、物理)で形が決まった時 |
| `heuristic` | 数値・閾値 | 根拠(実測、n、日付)。測っていない値は先頭に `unmeasured;` を付け、その数値で足りるはずの理由を書く | マジックナンバーを置いた時 |
| `temporal` | 期限 `YYYY-MM-DD` | 期限後にすること | 迂回・暫定コードを置いた時 |

4種の外は作らない。当てはまらないなら、それは判断ではなく説明なので書かない。

## 例

```js
// @lndf:why-not Promise.all | one failure must not reject the whole batch
const results = await Promise.allSettled(tasks);

// @lndf:constraint Chrome MV3 | service worker cannot stay alive; use alarms
chrome.alarms.create("tick", { periodInMinutes: 1 });

// @lndf:heuristic 300ms | perceived flicker threshold (n=5, 2026-04-12)
await sleep(300);

// @lndf:heuristic 100ms | unmeasured; most apps read the clipboard within one paste event, raise it if a paste comes out formatted
await sleep(100);

// @lndf:temporal 2026-12-01 | remove this branch after Supabase Auth v3 migration
const auth = legacyAuth();
```

```ahk
; @lndf:why-not SetTimer polling | WM_CLIPBOARDUPDATE fires only on change, no idle cost
OnClipboardChange(ClipChanged)
```

```python
# @lndf:why-not re.findall | need duplicate counts, Counter is direct
```

```sql
-- @lndf:constraint Supabase Data API 2026-10-30 | explicit GRANT required on new tables
```

## 置かないもの

- 関数の目的、引数、戻り値の説明(docstring / JSDoc の領分)
- 既定値をそのまま使った箇所、自明な選択
- 理由の無い値。後から理由を作らない。理由が分からない時は書かずに人に聞く
- 秘密値(API キー、トークン、パスワード、JWT)。接頭辞だけ(`sk-ant-` 等)なら書いてよい。validate.py が実物らしい値を検出すると値を伏せて FAIL にする
- 「TODO」「FIXME」の代わり(期限があるなら `temporal`、無いなら LNDF ではない)
- 出典リポジトリ名(普通のコメントで書く。4種のどれでもない)
- ファイル冒頭のバナー。配布ソース(artifact 等)に限り `/*! LNDF */` を置く。repo 内では不要

## コミットの trailer

コミットメッセージの末尾段落に、git の trailer(`Key: value` 行。`Signed-off-by:` と同じ仕組み)として置く。

```
<type>(<scope>): <subject>            ← 件名は Conventional Commits のまま

<本文。任意。電文体でよい>

LNDF-why-not: <value> | <reason>
LNDF-constraint: <value> | <reason>
LNDF-heuristic: <value> | <reason>
LNDF-temporal: YYYY-MM-DD | <reason>
LNDF-ref: memory:NNN
```

- キーは `LNDF-` + kind。kind の綴りはコメントと同一(変換しない)。大文字小文字は git が区別しない
- 右辺の書式はコメントと同じ `<value> | <reason>`、本文は英語、1判断1行。複数の判断は行を分ける
- `LNDF-ref` だけ `|` を持たない。値は `memory:NNN`、spec の ID、URL、またはコミット SHA。この変更が執行した決定を指す(事後照合用)。公開 repo では公開されている先(URL、コミット SHA)だけ
- **trailer は最後の段落にまとめる**。本文の途中に置くと git は trailer として扱わない(`git log --format='%(trailers:key=LNDF-temporal)'` で引けなくなる)
- diff から分かることは書かない。件名の言い換えも書かない。判断の無いコミット(typo、書式整形、依存更新)には trailer を付けない。「無し」を表す trailer は作らない
- 秘密値の扱いはコメントと同じ。validate.py が検出すると FAIL
- **メッセージはファイルに書いて `git commit -F <file>` で渡す。** `printf` / `echo` / `-m` でエスケープを使わない。`\r` や `\n` がシェルに展開されて本物の制御文字になり、見た目が正しくても記録が壊れる。validate.py は値の中の制御文字を FAIL にする

例:

```
feat(collect): read decisions from git trailers

LNDF-why-not: parse JSONL transcripts only | Codex workers have no JSONL; git log is the one source all agents share
LNDF-temporal: 2026-12-31 | drop the legacy reader once the new store is verified
LNDF-ref: https://example.com/decisions/7
```

### 引き方

- 期限の一覧: `git log --format='%h %(trailers:key=LNDF-temporal,valueonly)' | grep .`
- 捨てた案の一覧: `git log --format='%(trailers:key=LNDF-why-not,valueonly)' | grep .`
- ある決定を執行したコミット: `git log --format='%h %s' --grep='LNDF-ref: https://example.com/decisions/7'`

## 公開する repo

コメントと trailer の読み手は、その repo を読める全員。理由は「なぜ」なので、書き手の内部の事情がそのまま入りやすい。公開 repo では、読み手がコードか公開資料で確かめられる理由だけを書く。

- 書かない: 内部の記録の ID(チケット番号、`memory:NNN`)、商売・契約・審査の個別の事情、人名やハンドル名、計画や狙い、誰が決めたか
- constraint の出所が公開されているもの(プラットフォームの仕様、法令、公開された審査基準)は、そのまま書く。出所が非公開のもの(契約、内部の決定、特定の人の要望)は、コードが受けている技術上の制約の形に直す

  ```
  # 不可(出所が非公開)
  # @lndf:temporal 2026-12-31 | drop once the contract with the vendor ends
  # @lndf:constraint contract with <client> | responses must stay under 200 ms
  # 可(技術の形)
  # @lndf:temporal 2026-12-31 | drop the v1 endpoint fallback
  # @lndf:constraint latency budget | responses must stay under 200 ms
  ```

- 内部の記録と結びたい時は、向きを逆にする。公開のコミットから内部の ID を指さず、内部の記録の側にコミット SHA を書く
- 技術の形に直せない理由は書かない。その判断は内部の記録に残す
- 非公開 repo が後で公開されることがある。迷ったら公開として書く

## 手順

1. 書く前: 案を比べた / 外部制約で曲げた / 数値を決めた / 暫定で逃げた、のどれかが起きたら該当行を覚えておく
2. 書く時: その行の直上に1行
3. コミット前: この skill フォルダにある `validate.py` を `python <skillフォルダ>/validate.py <path...>` で通し、PASS のみコミット。`--index out.json` で `@lndf:` 行の一覧を書き出せる。**`--index` の出力先は repo の外にする**(全判断が1ファイルに集まるため、コミットしない)
   - PC の Claude Code: `python "$HOME/.claude/skills/lndf-comment/validate.py" <path...>`
   - それ以外(クラウド等): skill 読み込み時に示される Base directory の `validate.py`
4. コミット時: 変更の理由(捨てた案・暫定・執行した決定)があれば trailer に書く。書式の検査は `validate.py --commit-msg <file>` で、git の `commit-msg` hook に置くと自動で門になる(`hooks/commit-msg` を `.git/hooks/` にコピーするか、`git config core.hooksPath hooks`)。skill は書き方を教える側、hook が通さざるを得ない側で、両方置く
   - `--commit-msg` は既定では**書式だけ**を検査する(trailer の無いコミットは通る)。repo 全体で「判断のあるコミットには必ず trailer」を課したい時だけ `--require` を足す。`--require` は merge / revert / `chore:` / `style:` / `docs:` を免除する
   - hook が `--require` を足すのは、`git config lndf.require true` が設定されている時(その repo だけ。設定は `.git/config` に入るので、clone し直したら入れ直す)か、環境変数 `LNDF_REQUIRE=1` がある時(それが届く全 repo)。どちらか一方で効き、`lndf.require false` は `LNDF_REQUIRE=1` を打ち消さない。どちらも無ければ hook は書式だけを検査する

## 他のエージェント(Codex 等)への配布

この SKILL.md は Claude Code 以外でも読める。置き場はエージェントごとに決まっている(Codex の公式: https://learn.chatgpt.com/docs/build-skills )。

| エージェント | 全体(この機械の全 repo) | repo 単位 |
|---|---|---|
| Claude Code | `~/.claude/skills/lndf-comment/` | `.claude/skills/lndf-comment/` |
| Codex | `~/.agents/skills/lndf-comment/` | `.agents/skills/lndf-comment/`(複数形。作業ディレクトリから repo 直下まで遡って探す) |

AGENTS.md には `AGENTS.snippet.md` の文面を貼る。全体用は Codex のホーム(`$CODEX_HOME`、既定 `~/.codex`)の `AGENTS.md`、repo 用は repo 直下の `AGENTS.md`。commit-msg hook は git 側なので、どのエージェントのコミットにも同じ門が効く。

repo にも置くのは、別の機械(Orca の SSH worktree 等)で動く時に repo と一緒に運ばれるのがこのコピーだけだから。repo に置く時は改行と実行権を固定する。Windows の `core.autocrlf=true` で CRLF に変換されると hook の1行目が `#!/bin/sh\r` になり動かなくなる。

- `.gitattributes` に `.agents/** text eol=lf`
- `git update-index --chmod=+x .agents/skills/lndf-comment/hooks/*`

hook は LNDF 行の無いメッセージを Python を呼ばずに通す(`--require` 時を除く)。グローバルに置いても、Python の無い環境で無関係なコミットは止まらない。

## 参照

- 規約の全体: LNDF の README(https://github.com/moncface/lndf#reference-implementation-lndf-comment)の節「Reference Implementation: lndf-comment」と、その次の節「The .lndf File」
