import { assertEquals } from "@std/assert";
import {
  judgePopoverLayout,
  type PopoverProbe,
  popoverProbeExpr,
} from "./popover-overflow.ts";

/** 判定が通る計測値のひな型（各テストで壊したい項目だけ上書きする） */
const HEALTHY: PopoverProbe = {
  top: 8,
  bottom: 739,
  viewportHeight: 813,
  clientHeight: 731,
  scrollHeight: 3840,
  overflowY: "auto",
  maxHeight: "731px",
  itemCount: 14,
  firstItemReachable: true,
  lastItemReachable: true,
  sampledPoints: 15,
  occludedPoints: 0,
};

Deno.test("judgePopoverLayout: 収まりきらなくてもスクロール可能で両端に到達できれば OK", () => {
  assertEquals(judgePopoverLayout(HEALTHY), { ok: true, reasons: [] });
});

Deno.test("judgePopoverLayout: TASK-117 の実測値（上端が画面外・スクロール不可）は NG", () => {
  // ヘッドレス CDP 実測: viewport 813px / 14 項目 / top -3100 / overflow visible
  const judged = judgePopoverLayout({
    ...HEALTHY,
    top: -3100,
    bottom: 740,
    clientHeight: 3840,
    overflowY: "visible",
    maxHeight: "none",
    firstItemReachable: false,
    lastItemReachable: true,
  });
  assertEquals(judged.ok, false);
  assertEquals(judged.reasons.length, 2);
});

Deno.test("judgePopoverLayout: 上端が 1px 未満の誤差なら丸めとして許容する", () => {
  assertEquals(judgePopoverLayout({ ...HEALTHY, top: -0.5 }).ok, true);
});

Deno.test("judgePopoverLayout: 下端がビューポート外なら NG", () => {
  const judged = judgePopoverLayout({ ...HEALTHY, bottom: 900 });
  assertEquals(judged.ok, false);
  assertEquals(judged.reasons.length, 1);
});

Deno.test("judgePopoverLayout: はみ出していなければ overflow-y: visible でも OK", () => {
  // attribution パネルのように内容が収まる場合は従来どおりの見た目でよい
  assertEquals(
    judgePopoverLayout({
      ...HEALTHY,
      clientHeight: 120,
      scrollHeight: 120,
      overflowY: "visible",
      maxHeight: "none",
      itemCount: 0,
      firstItemReachable: null,
      lastItemReachable: null,
    }),
    { ok: true, reasons: [] },
  );
});

Deno.test("judgePopoverLayout: 本文が他の UI に覆われていれば NG", () => {
  // タイムライン（z-index: 10）がポップオーバーより前面にあると本文が読めない
  const judged = judgePopoverLayout({ ...HEALTHY, occludedPoints: 5 });
  assertEquals(judged.ok, false);
  assertEquals(judged.reasons.length, 1);
});

Deno.test("judgePopoverLayout: 末尾項目に到達できなければ NG", () => {
  const judged = judgePopoverLayout({ ...HEALTHY, lastItemReachable: false });
  assertEquals(judged.ok, false);
  assertEquals(judged.reasons.length, 1);
});

Deno.test("judgePopoverLayout: カードが見つからない（null）なら NG", () => {
  assertEquals(judgePopoverLayout(null).ok, false);
});

/**
 * popoverProbeExpr が返す評価式文字列をスタブ document / window で実行する。
 * ブラウザへ送るのと同じ文字列を Function として動かし、scrollTop 操作を含む
 * 計測手順そのものを検証する。
 *
 * @param opts.cardTop カード上端の viewport 座標
 * @param opts.clientHeight カードの可視領域の高さ
 * @param opts.itemHeights 各項目の高さ（内容全体の高さの元になる）
 * @param opts.occluded true なら検査点の最前面が別要素（タイムライン相当）になる
 */
function evalProbeExpr(opts: {
  cardTop: number;
  clientHeight: number;
  itemHeights: number[];
  overflowY: string;
  scrollable: boolean;
  occluded?: boolean;
}): PopoverProbe | null {
  const scrollHeight = opts.itemHeights.reduce((a, b) => a + b, 0);
  // 項目の内容上の配置（カード内容の先頭からのオフセット）
  const offsets: number[] = [];
  opts.itemHeights.reduce((acc, h) => {
    offsets.push(acc);
    return acc + h;
  }, 0);

  // scrollTop はブラウザと同じく [0, scrollHeight - clientHeight] に丸める。
  // スクロール不可（overflow: visible 相当）のカードは代入を無視して 0 のまま。
  let scrollTop = 0;
  const card = {
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(value: number) {
      if (!opts.scrollable) return;
      scrollTop = Math.max(
        0,
        Math.min(value, scrollHeight - opts.clientHeight),
      );
    },
    clientHeight: opts.clientHeight,
    scrollHeight,
    getBoundingClientRect: () => ({
      top: opts.cardTop,
      bottom: opts.cardTop + opts.clientHeight,
      left: 8,
      width: 300,
      height: opts.clientHeight,
    }),
    contains: (el: unknown) => el === card,
    querySelectorAll: () =>
      opts.itemHeights.map((h, i) => ({
        getBoundingClientRect: () => ({
          top: opts.cardTop + offsets[i] - scrollTop,
          bottom: opts.cardTop + offsets[i] + h - scrollTop,
        }),
      })),
  };
  const occluder = { tagName: "DIV" };
  const stubDocument = {
    querySelector: () => card,
    elementFromPoint: () => (opts.occluded === true ? occluder : card),
  };
  const stubWindow = {
    innerHeight: 813,
    innerWidth: 1600,
    getComputedStyle: () => ({ overflowY: opts.overflowY, maxHeight: "none" }),
  };
  const fn = new Function(
    "document",
    "window",
    `return ${popoverProbeExpr("#known-limitations-content", "li")};`,
  );
  return fn(stubDocument, stubWindow) as PopoverProbe | null;
}

Deno.test("popoverProbeExpr: スクロール可能なら先頭・末尾のどちらにも到達できると測る", () => {
  const probe = evalProbeExpr({
    cardTop: 8,
    clientHeight: 200,
    itemHeights: [100, 100, 100, 100],
    overflowY: "auto",
    scrollable: true,
  });
  assertEquals(probe?.itemCount, 4);
  assertEquals(probe?.firstItemReachable, true);
  assertEquals(probe?.lastItemReachable, true);
  assertEquals(probe?.scrollHeight, 400);
  // 計測後は先頭表示に戻す（スクリーンショットを安定させるため）
  assertEquals(probe?.top, 8);
});

Deno.test("popoverProbeExpr: スクロールできないカードは末尾項目に到達できないと測る", () => {
  const probe = evalProbeExpr({
    cardTop: 8,
    clientHeight: 200,
    itemHeights: [100, 100, 100, 100],
    overflowY: "visible",
    scrollable: false,
  });
  assertEquals(probe?.firstItemReachable, true);
  assertEquals(probe?.lastItemReachable, false);
  assertEquals(judgePopoverLayout(probe).ok, false);
});

Deno.test("popoverProbeExpr: カードが画面上端より上へ伸びた分は到達不能と測る（TASK-117 の再現）", () => {
  // max-height 無しでカード全体が画面外まで伸びた状態。カード基準では項目は
  // カード内に収まっているが、ビューポートとの交差で見れば先頭は読めない
  const probe = evalProbeExpr({
    cardTop: -300,
    clientHeight: 400,
    itemHeights: [100, 100, 100, 100],
    overflowY: "visible",
    scrollable: false,
  });
  assertEquals(probe?.firstItemReachable, false);
  assertEquals(judgePopoverLayout(probe).ok, false);
});

Deno.test("popoverProbeExpr: 検査点の最前面が別要素ならその数を覆い被さりとして数える", () => {
  const probe = evalProbeExpr({
    cardTop: 8,
    clientHeight: 200,
    itemHeights: [100, 100],
    overflowY: "auto",
    scrollable: true,
    occluded: true,
  });
  assertEquals(probe?.sampledPoints, 15);
  assertEquals(probe?.occludedPoints, 15);
  assertEquals(judgePopoverLayout(probe).ok, false);
});

Deno.test("popoverProbeExpr: 覆われていなければ occludedPoints は 0", () => {
  const probe = evalProbeExpr({
    cardTop: 8,
    clientHeight: 200,
    itemHeights: [100, 100],
    overflowY: "auto",
    scrollable: true,
  });
  assertEquals(probe?.sampledPoints, 15);
  assertEquals(probe?.occludedPoints, 0);
});

Deno.test("popoverProbeExpr: 対象要素が無ければ null を返す", () => {
  const fn = new Function(
    "document",
    "window",
    `return ${popoverProbeExpr("#missing", null)};`,
  );
  assertEquals(fn({ querySelector: () => null }, {}), null);
});
