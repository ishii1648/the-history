import { assertEquals, assertStrictEquals } from "@std/assert";
import { memoizeLatest } from "./memo.ts";

Deno.test("memoizeLatest: 同じ引数（参照同値）なら再計算しない", () => {
  let calls = 0;
  const arg = { id: 1 };
  const memoized = memoizeLatest((x: { id: number }) => {
    calls++;
    return x.id * 2;
  });

  assertEquals(memoized(arg), 2);
  assertEquals(memoized(arg), 2);
  assertEquals(memoized(arg), 2);
  assertEquals(calls, 1);
});

Deno.test("memoizeLatest: 引数（参照）が変われば再計算する", () => {
  let calls = 0;
  const memoized = memoizeLatest((x: { id: number }) => {
    calls++;
    return x.id * 2;
  });

  const a = { id: 1 };
  const b = { id: 2 };
  assertEquals(memoized(a), 2);
  assertEquals(memoized(b), 4);
  assertEquals(memoized(a), 2);
  assertEquals(calls, 3);
});

Deno.test("memoizeLatest: プリミティブ引数（year 等）も参照同値として扱う", () => {
  let calls = 0;
  const memoized = memoizeLatest((year: number) => {
    calls++;
    return year + 1;
  });

  assertEquals(memoized(1648), 1649);
  assertEquals(memoized(1648), 1649);
  assertEquals(calls, 1);
  assertEquals(memoized(1700), 1701);
  assertEquals(calls, 2);
});

Deno.test("memoizeLatest: 複数引数のうち 1 つでも変われば再計算する", () => {
  let calls = 0;
  const a = { v: "a" };
  const b = { v: "b" };
  const memoized = memoizeLatest((x: { v: string }, year: number) => {
    calls++;
    return `${x.v}-${year}`;
  });

  assertEquals(memoized(a, 1648), "a-1648");
  assertEquals(memoized(a, 1648), "a-1648");
  assertEquals(calls, 1);
  // 片方だけ変わっても再計算される
  assertEquals(memoized(a, 1700), "a-1700");
  assertEquals(calls, 2);
  assertEquals(memoized(b, 1700), "b-1700");
  assertEquals(calls, 3);
});

Deno.test("memoizeLatest: キャッシュヒット時は同一の結果オブジェクト参照を返す", () => {
  const memoized = memoizeLatest((x: number) => ({ doubled: x * 2 }));
  const first = memoized(21);
  const second = memoized(21);
  assertStrictEquals(first, second);
});

Deno.test("memoizeLatest: 1 スロットのみ保持（直近以外の引数はキャッシュされない）", () => {
  let calls = 0;
  const memoized = memoizeLatest((x: number) => {
    calls++;
    return x;
  });

  const a = 1;
  const b = 2;
  memoized(a);
  memoized(b);
  memoized(a); // a は既に追い出されている想定 → 再計算される
  assertEquals(calls, 3);
});
