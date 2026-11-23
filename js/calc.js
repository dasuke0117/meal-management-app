// 目標カロリー・PFCの計算
export const ACTIVITY = [
  { v: 1.2, label: "ほぼ座りっぱなし" },
  { v: 1.375, label: "軽い運動（週1〜3回）" },
  { v: 1.55, label: "中程度（週3〜5回）" },
  { v: 1.725, label: "活発（週6〜7回）" },
  { v: 1.9, label: "非常に活発（肉体労働など）" },
];
export const MIN_KCAL = 1200;

/** 最新の体重記録（日付が最も新しいもの） */
export function latestWeight(weights) {
  const dates = Object.keys(weights || {}).filter((d) => weights[d] > 0).sort();
  if (!dates.length) return null;
  const d = dates[dates.length - 1];
  return { date: d, kg: weights[d] };
}

/** Mifflin-St Jeor 式 */
export function bmr({ sex, age, heightCm }, kg) {
  const base = 10 * kg + 6.25 * heightCm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

/**
 * 自動計算の結果。体重未入力なら null。
 * 戻り値: { kg, bmr, tdee, kcal, p, f, c, clamped }
 */
export function autoTarget(profile, weights) {
  const w = latestWeight(weights);
  if (!w || !profile.age || !profile.heightCm) return null;
  const b = bmr(profile, w.kg);
  const tdee = b * profile.activity;
  let kcal = tdee;
  if (profile.goal === "lose") kcal = tdee - (profile.pace || 500);
  else if (profile.goal === "gain") kcal = tdee + 300;
  // 安全のため基礎代謝程度（最低1200kcal）を下回らないようにする
  const floor = Math.max(MIN_KCAL, b);
  const clamped = kcal < floor;
  if (clamped) kcal = floor;
  kcal = Math.round(kcal);
  const p = Math.round(w.kg * (profile.goal === "lose" ? 2.0 : 1.6));
  const f = Math.round((kcal * 0.25) / 9);
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kg: w.kg, bmr: Math.round(b), tdee: Math.round(tdee), kcal, p, f, c, clamped };
}

/** 実際に使う目標値（手動上書きがあればそちら） */
export function currentTarget(data) {
  if (data.targetOverride) return { ...data.targetOverride, manual: true };
  const a = autoTarget(data.profile, data.weights);
  return a ? { kcal: a.kcal, p: a.p, f: a.f, c: a.c, manual: false } : null;
}

export function sumEntries(entries) {
  return entries.reduce(
    (s, e) => ({ kcal: s.kcal + (+e.kcal || 0), p: s.p + (+e.p || 0), f: s.f + (+e.f || 0), c: s.c + (+e.c || 0) }),
    { kcal: 0, p: 0, f: 0, c: 0 }
  );
}
