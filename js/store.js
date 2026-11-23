// データ保存（localStorage にキー1つで JSON 保存）
const KEY = "mealApp.v1";
export const DEFAULT_MODEL = "claude-opus-5-5";

export function defaultData() {
  return {
    version: 1,
    profile: { sex: "male", age: 30, heightCm: 170, activity: 1.375, goal: "maintain", pace: 500 },
    targetOverride: null,
    foods: [],
    entries: [],
    weights: {},
    plan: null,
    settings: { apiKey: "", model: DEFAULT_MODEL, lastExport: null },
  };
}

function normalize(d) {
  const base = defaultData();
  const out = { ...base, ...d };
  out.profile = { ...base.profile, ...(d.profile || {}) };
  out.settings = { ...base.settings, ...(d.settings || {}) };
  out.foods = Array.isArray(d.foods) ? d.foods : [];
  out.entries = Array.isArray(d.entries) ? d.entries : [];
  out.weights = d.weights && typeof d.weights === "object" ? d.weights : {};
  out.version = 1;
  return out;
}

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaultData();
  } catch {
    return defaultData();
  }
}

export function getData() {
  return data;
}

/** fn(data) で書き換えて保存 */
export function update(fn) {
  fn(data);
  save();
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    alert("保存に失敗しました（端末の空き容量を確認してください）");
    throw e;
  }
  listeners.forEach((l) => l(data));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function exportJson(includeKey) {
  const copy = JSON.parse(JSON.stringify(data));
  if (!includeKey) copy.settings.apiKey = "";
  delete copy.settings.lastExport;
  return JSON.stringify(copy, null, 2);
}

/** インポート：内容を検証して全置換。APIキーが空ならいまのキーを残す */
export function importJson(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error("このアプリのバックアップファイルではありません");
  }
  const keepKey = data.settings.apiKey;
  data = normalize(parsed);
  if (!data.settings.apiKey) data.settings.apiKey = keepKey;
  data.settings.lastExport = new Date().toISOString();
  save();
}

export function resetAll() {
  localStorage.removeItem(KEY);
  data = defaultData();
  save();
}
