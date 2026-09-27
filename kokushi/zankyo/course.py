"""雪嶺の黒騎士 斬響 — 譜面（コース）の定義・検証・計測

譜面は「小節ごとに、おすすめレーンと、そのレーンから見た敵の向き」で書く。
  L = 左どなり、C = 正面、R = 右どなり、F = 最後の3体（回転斬り）
向きはそのまま旋律の高さになる（L = 和音の低い音、C = 真ん中、R = 高い音）。

実行すると course.json を書き出し、検証と、旧コース（五路）との比較を表示する。
  python3 course.py            検証して course.json を出力
  python3 course.py --compare  旧コースとの比較も出す
"""
import json, sys, os

BPM = 172
# ドラムの位置（拍）。キック = 0, 2.5（2回目のサビは 1.5 も）、スネア = 1, 3
KICK = {0.0, 2.5}
KICK2 = {0.0, 1.5, 2.5}
SNARE = {1.0, 3.0}

# ---------------------------------------------------------------------------
# 譜面。bar: (レーン, "拍+向き ...", 追加)
#   追加： "m拍>レーン" = その拍でレーン移動（敵のいない拍）、"J拍" = 低い壁（W）、
#          "O拍:レーン…" = 氷柱（その拍に通過）
# 1小節は4拍。0 = 小節の頭。ドラムンベースの「ドン・タン・(ッ)ドン・タン」= 0, 1, 2.5, 3
# ---------------------------------------------------------------------------
BARS = {
    # ── 序（0〜7）：正面 → 左右 → 刻み。1小節に2〜3体、休みを大きく
    2:  (2, "0C 2C", ""),
    3:  (2, "0C 2C", ""),
    4:  (2, "0L 2R", ""),
    5:  (2, "0R 2L", ""),
    6:  (2, "0C 1C 2C", ""),
    7:  (2, "0L 1C 2R", "m3>3"),                    # 最初のレーン移動：敵のいない4拍目。次の敵まで1拍ある
    # ── 破（8〜15）：ブレイクビーツ。「ドン・タン・ッドン・タン」をまず正面で覚え、次に向きを付ける
    8:  (3, "0C 1C 2.5C 3C", ""),
    9:  (3, "0L 1R 2.5L 3R", ""),
    10: (3, "0C 1C 3C", "m2>2"),                    # 移動する小節は「ッドン」を抜いて、1拍の余裕を作る
    11: (2, "1C 2.5L 3R", "J0"),                    # 頭で跳ぶ → 斬る
    12: (2, "0L 1C 2.5R 3C", ""),
    13: (2, "0R 1C 3C", "m2>1"),
    14: (1, "0C 1L 2.5C", "m3.5>2"),
    15: (2, "1C 2C 2.5C", "O3:13"),                 # 溜め：4拍目は敵なし（左右の氷柱が通り過ぎる）
    # ── 急の一（16〜31）：サビ。4小節で1フレーズ＝「型・同じ型・鏡の型・締め」。
    #    型 A = 左→中→右→中（和音を上ってもどる）、鏡 A' = 右→中→左→中
    16: (2, "0L 1C 2.5R 3C", ""),
    17: (2, "0L 1C 2.5R 3C", ""),
    18: (2, "0R 1C 2.5L 3C", ""),
    19: (2, "0C 1L 2C 2.5R", "m3>3"),              # 締め：駆け上がって、4拍目で右へ移る
    20: (3, "0L 1C 2.5R 3C", ""),                   # 同じフレーズを右のレーンで
    21: (3, "0L 1C 2.5R 3C", ""),
    22: (3, "0R 1C 2.5L 3C", ""),
    23: (3, "0C 1L 1.5C 2R", "m3>2"),               # 締め（形を少し変える）→ 中央へ
    24: (2, "1L 2.5R 3L", "J0"),                    # 型 B = 振り子（左右に刀が往復する）
    25: (2, "0R 1L 2.5R 3L", ""),
    26: (2, "0R 1L 3R", "m2>1"),
    27: (1, "0C 1L 2C 2.5R", "m3>2"),
    28: (2, "0L 1C 2.5R 3C", ""),                   # 型 A に戻る（聞き覚えのある形で盛り上げる）
    29: (2, "0L 1C 2.5R 3C", ""),
    30: (2, "0R 1C 2.5L 3C", ""),
    31: (2, "0C 1L 1.5C 2R 2.5C 3L", ""),           # 6連の駆け上がり → 半拍おいて、32小節の頭で壁
    # ── 急の二（32〜39）：キックが1.5拍にも増える。型に1体足して「ドン・タン・タ・ッドン・タン」
    32: (2, "1L 1.5C 2.5R 3C", "J0"),
    33: (2, "0L 1C 1.5R 2.5C 3L", ""),
    34: (2, "0R 1C 1.5L 3C", "m2>3"),
    35: (3, "0C 1L 1.5C 2R 2.5C 3L", "m3.5>2"),
    36: (2, "1L 1.5C 2.5R 3C", "J0"),
    37: (2, "0L 1C 1.5R 3C", "m2>1"),
    38: (1, "0C 1R 1.5C 2.5R 3C", ""),
    39: (1, "0L 0.5C 1R 1.5C 2L 2.5C 3R 3.5C", ""),  # 8連の竜巻：左・中・右・中…と刀が往復する
}
FINAL_BEAT = 160  # 40小節の頭：3体同時の回転斬り
OFFS = {'L': -1, 'C': 0, 'R': 1}


def build():
    ev = []       # (beat, kind, data)
    route = []    # (beat, lane)
    for bar in sorted(BARS):
        lane, notes, extra = BARS[bar]
        base = bar * 4
        if not route or route[-1][1] != lane: route.append((base, lane))
        moves = {}
        for tok in extra.split():
            if tok[0] == 'm':
                b, l = tok[1:].split('>'); moves[float(b)] = int(l)
            elif tok[0] == 'J':
                ev.append((base + float(tok[1:]), 'J', None))
            elif tok[0] == 'O':
                b, ls = tok[1:].split(':'); ev.append((base + float(b), 'O', [int(c) for c in ls]))
        cur = lane
        for tok in notes.split():
            b, d = float(tok[:-1]), tok[-1]
            for mb in sorted(moves):
                if mb < b: cur = moves[mb]
            l = cur + OFFS[d]
            assert 0 <= l <= 4, (bar, tok, cur)
            ev.append((base + b, 'E', {'lane': l, 'dir': d, 'route': cur}))
        for mb, l in sorted(moves.items()):
            route.append((base + mb, l))
            # 移動の合図：元のレーンに氷柱（移動の0.5拍あとに通過）
            ev.append((base + mb + 0.5, 'O', [lane if not route or True else lane]))
            lane = l
    ev.append((FINAL_BEAT, 'F', None))
    ev.sort(key=lambda e: e[0])
    return ev, route


def lane_at(route, b):
    l = route[0][1]
    for bb, ll in route:
        if bb <= b + 1e-9: l = ll
    return l


def validate(ev, route):
    errs = []
    Es = [e for e in ev if e[1] == 'E']
    for b, k, d in ev:
        l = lane_at(route, b)
        if k == 'E' and abs(d['lane'] - l) > 1: errs.append(f'{b}: 敵がおすすめレーン {l} から届かない')
        if k == 'O' and l in d: errs.append(f'{b}: 氷柱がおすすめレーン {l} にある')
        if k in ('J',) and any(abs(e[0] - b) < 0.75 for e in Es): errs.append(f'{b}: 壁の前後0.75拍に敵がいる')
    # 移動は敵のいない拍で、0.5拍前から1拍後まで敵がいないこと（斬ると動くを同時に考えなくてよい）
    for b, l in route[1:]:
        if any(-0.5 + 1e-9 < e[0] - b < 1.0 - 1e-9 for e in Es): errs.append(f'{b}: 移動の0.5拍前〜1拍後に敵がいる（斬ると動くが重なる）')
    # 同じ向きの8分連打は2回まで（刀が往復しない振りを続けさせない）
    for i in range(2, len(Es)):
        a, bb, c = Es[i - 2], Es[i - 1], Es[i]
        if c[0] - a[0] <= 1.0 + 1e-9 and a[2]['dir'] == bb[2]['dir'] == c[2]['dir'] and a[2]['dir'] != 'C':
            errs.append(f'{c[0]}: 同じ横向きの8分が3連続')
    return errs


def metrics(ev, route, bpm=BPM, sections=((8, 64, '序・破 2〜15'), (64, 128, 'サビ一 16〜31'), (128, 160, 'サビ二 32〜39'))):
    beat = 60 / bpm
    out = []
    Es = [e for e in ev if e[1] == 'E']
    for a, z, name in sections:
        es = [e for e in Es if a <= e[0] < z]
        if not es: continue
        secs = (z - a) * beat
        kick2 = a >= 128
        acc = sum(1 for e in es if (e[0] % 4) in (KICK2 if kick2 else KICK) or (e[0] % 4) in SNARE)
        dirs = [e[2]['dir'] for e in es]
        ch = sum(1 for i in range(1, len(dirs)) if dirs[i] != dirs[i - 1])
        run = best = 1
        for i in range(1, len(es)):
            run = run + 1 if abs(es[i][0] - es[i - 1][0] - 0.5) < 1e-6 else 1
            best = max(best, run)
        mv = sum(1 for b, l in route[1:] if a <= b < z)
        steps = sum(abs(route[i][1] - route[i - 1][1]) for i in range(1, len(route)) if a <= route[i][0] < z)
        # 同時に考えること：斬る直前（0.5拍以内）にレーンを変える必要がある回数
        busy = sum(1 for b, l in route[1:] if a <= b < z and any(0 < e[0] - b < 1.0 - 1e-9 for e in es))
        rest_bars = sum(1 for bar in range(a // 4, z // 4) if not any(bar * 4 <= e[0] < bar * 4 + 4 for e in es) or
                        max([0] + [e2[0] - e1[0] for e1, e2 in zip([x for x in es if bar*4 <= x[0] < bar*4+4], [x for x in es if bar*4 <= x[0] < bar*4+4][1:])]) >= 1.5)
        pats = []
        for bar in range(a // 4, z // 4):
            pats.append(tuple((round(e[0] - bar * 4, 2), e[2]['dir']) for e in es if bar * 4 <= e[0] < bar * 4 + 4))
        rep = sum(1 for i, p in enumerate(pats) if p and ((i >= 1 and pats[i - 1] == p) or (i >= 2 and pats[i - 2] == p) or (i >= 4 and pats[i - 4] == p)))
        out.append(dict(motif=rep / max(1, sum(1 for p in pats if p)), name=name, n=len(es), per_s=len(es) / secs, per_bar=len(es) / ((z - a) / 4), on_drum=acc / len(es),
                        dir_change=ch / max(1, len(dirs) - 1), max_8th_run=best, moves=mv, inputs=(len(es) + steps) / secs, busy=busy))
    return out


def old_course():
    p = os.path.join(os.path.dirname(__file__), '..', 'original', 'course.json')
    d = json.load(open(p))
    ev, route = [], [(b, l) for b, l in d['path']]
    for b, c in d['events']:
        if c[0] == 'E':
            l = int(c[1]); r = lane_at(route, b); dd = l - r
            ev.append((b, 'E', {'lane': l, 'dir': 'LCR'[dd + 1] if abs(dd) <= 1 else '?', 'route': r}))
    # 旧コースの「移動」は、ルートでレーンが変わった点
    rt = [route[0]] + [route[i] for i in range(1, len(route)) if route[i][1] != route[i - 1][1]]
    return ev, rt


def show(title, ms):
    print(title)
    for m in ms:
        print(f"  {m['name']}: 敵{m['n']}体  {m['per_s']:.2f}体/秒（1小節{m['per_bar']:.1f}体）  ドラムの強拍上{m['on_drum']:.0%}"
              f"  向きの切り替え{m['dir_change']:.0%}  8分連続の最長{m['max_8th_run']}  移動{m['moves']}回（うち1拍以内に斬る{m['busy']}回）  キー入力{m['inputs']:.2f}回/秒  型の繰り返し{m['motif']:.0%}")


if __name__ == '__main__':
    ev, route = build()
    errs = validate(ev, route)
    if errs:
        print('NG'); [print(' ', e) for e in errs]; sys.exit(1)
    nE = sum(1 for e in ev if e[1] == 'E') + 3
    print(f'OK  敵 {nE} 体（最後の3体を含む）、氷柱 {sum(1 for e in ev if e[1]=="O")}、壁 {sum(1 for e in ev if e[1]=="J")}、移動 {len(route)-1 - sum(1 for b,l in route if b % 4 == 0 and b > 8) + 0}')
    pts = sorted(set([b for b, k, d in ev] + [b for b, l in route]))
    path = [[b, lane_at(route, b)] for b in pts]
    json.dump({'bpm': BPM, 'events': [[b, k, d] for b, k, d in ev], 'route': route, 'path': path, 'final': FINAL_BEAT},
              open(os.path.join(os.path.dirname(__file__), 'course.json'), 'w'), ensure_ascii=False)
    show('斬響（新）', metrics(ev, route))
    if '--compare' in sys.argv:
        oev, ort = old_course()
        show('五路（旧）', metrics(oev, ort))
