// Claude API 呼び出し（ブラウザから直接）
// SDK はネット接続時だけ読み込む（オフラインでもアプリ本体は動くように動的 import）
const SDK_URL = "https://esm.sh/@anthropic-ai/sdk";

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5（既定・高品質）" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5（やや安い）" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5（最安）" },
];

const num = { type: "number" };
const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["days", "shopping", "notes"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["day", "meals"],
        properties: {
          day: { type: "integer" },
          meals: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["meal", "name", "ingredients", "kcal", "p", "f", "c"],
              properties: {
                meal: { type: "string", enum: ["朝", "昼", "夕", "間食"] },
                name: { type: "string" },
                ingredients: { type: "array", items: { type: "string" } },
                kcal: num, p: num, f: num, c: num,
              },
            },
          },
        },
      },
    },
    shopping: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "item", "amount"],
        properties: {
          category: { type: "string", enum: ["野菜", "肉魚", "乳製品", "その他"] },
          item: { type: "string" },
          amount: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
};

const SYSTEM = `あなたは日本の家庭料理に詳しい管理栄養士です。利用者の目標カロリー・PFCに近づく献立を立て、買い物リストを作ります。
- 1日の合計が目標kcal・PFCにおおむね近くなるように（±10%程度）配分する
- 各食事の kcal / p / f / c はその1食分の目安（g）を数値で入れる
- ingredients には「鶏むね肉 150g」のように分量つきで書く
- 日本のスーパーで手に入る食材を使い、作り置きや食材の使い回しで無駄を減らす
- shopping は全日程分をまとめ、同じ食材は合算する。amount は「2パック」「300g」など買うときの単位
- notes には献立全体のポイントや作り置きのコツを2〜4文で書く
- 利用者の要望（好き嫌い・予算・手間・使いたい食材）を最優先する`;

export class AiError extends Error {}

/** SDKを読み込んでクライアントを作る */
async function makeClient(apiKey) {
  if (!apiKey) throw new AiError("APIキーが設定されていません。設定画面でAPIキーを保存してください。");
  if (!navigator.onLine) throw new AiError("オフラインです。インターネットに接続してから試してください。");
  let Anthropic;
  try {
    ({ default: Anthropic } = await import(SDK_URL));
  } catch {
    throw new AiError("AI機能の読み込みに失敗しました。通信状況を確認して、もう一度試してください。");
  }
  // 自分専用アプリでキーは本人の端末にしか保存しないため、ブラウザからの直接呼び出しを許可
  return { Anthropic, client: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
}

/**
 * 構造化出力(JSON)でAIを呼び、パース済みの結果を返す
 * @param {{apiKey, model, system, userText, schema, maxTokens, effort, tooLongMsg}} o
 */
async function callJson({ apiKey, model, system, userText, schema, maxTokens, effort, tooLongMsg }, onProgress) {
  const { Anthropic, client } = await makeClient(apiKey);
  const params = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userText }],
    output_config: { effort, format: { type: "json_schema", schema } },
  };

  // 安全フィルタで断られたとき、サーバー側で別モデルに引き継ぐ（Haikuは非対応）
  const useFallback = model !== "claude-haiku-5-5";

  let message;
  try {
    const stream = useFallback
      ? client.beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : client.messages.stream(params);
    let chars = 0;
    if (onProgress) stream.on("text", (t) => { chars += t.length; onProgress(chars); });
    message = await stream.finalMessage();
  } catch (e) {
    throw new AiError(explainError(e, Anthropic));
  }

  if (message.stop_reason === "refusal") {
    throw new AiError("AIがこの依頼への回答を控えました。書き方を変えてもう一度試してください。");
  }
  if (message.stop_reason === "max_tokens") throw new AiError(tooLongMsg);

  // 途中で別モデルに引き継がれた場合は、最後の引き継ぎ以降のテキストだけを使う
  let text = "";
  for (const block of message.content) {
    if (block.type === "fallback") text = "";
    else if (block.type === "text") text += block.text;
  }
  try {
    return { data: JSON.parse(text), model: message.model };
  } catch {
    throw new AiError("AIの応答を読み取れませんでした。もう一度試してください。");
  }
}

/**
 * 献立を生成する
 * @param {{apiKey:string, model:string, days:number, request:string, target:{kcal,p,f,c}, foods:Array}} opts
 * @param {(chars:number)=>void} onProgress 受信した文字数
 */
export async function generatePlan({ apiKey, model, days, request, target, foods }, onProgress) {
  const foodList = foods.length
    ? foods.map((f) => `- ${f.name}${f.unit ? `（${f.unit}）` : ""}: ${f.kcal}kcal P${f.p} F${f.f} C${f.c}`).join("\n")
    : "（なし）";
  const userText = `${days}日分の献立と買い物リストを作ってください。

## 1日の目標
${target ? `${target.kcal}kcal / たんぱく質 ${target.p}g / 脂質 ${target.f}g / 炭水化物 ${target.c}g` : "未設定（一般的な成人の健康的な食事で）"}

## 要望
${request.trim() || "特になし"}

## よく食べる定型食品（参考。使ってもよい）
${foodList}

食事区分は 朝・昼・夕・間食（間食は必要なときだけ）。day は 1 から ${days} まで。`;

  const { data, model: usedModel } = await callJson({
    apiKey, model, system: SYSTEM, userText, schema: PLAN_SCHEMA,
    maxTokens: 16000, effort: "medium",
    tooLongMsg: "献立が長すぎて途中で切れました。日数を減らすか、要望を短くして試してください。",
  }, onProgress);
  return { ...data, model: usedModel };
}

const NUTRITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["unit", "kcal", "p", "f", "c", "note"],
  properties: {
    unit: { type: "string" },
    kcal: num, p: num, f: num, c: num,
    note: { type: "string" },
  },
};

const NUTRITION_SYSTEM = `あなたは日本の食品成分表（日本食品標準成分表）や外食・市販品の栄養表示に詳しい管理栄養士です。
食品名と量から、エネルギー(kcal)・たんぱく質p(g)・脂質f(g)・炭水化物c(g)を推定します。
- 量の指定があればその量の値を返し、unit にはその量をそのまま入れる
- 量の指定がなければ、日本で一般的な1人前・1個などを想定し、その量を unit に入れる（例「1杯（250g）」「1個（50g）」）
- チェーン店や市販品の名前があれば、公表されている栄養成分の値をできるだけ使う
- 料理は一般的なレシピで推定する。kcal は整数、PFC は小数第1位まで
- note には推定の前提（想定した量や中身）を日本語で1文だけ書く`;

/**
 * 食品名と量からkcal/PFCを推定する
 * @returns {{unit, kcal, p, f, c, note}}
 */
export async function estimateNutrition({ apiKey, model, name, unit }) {
  const userText = `食品名：${name}
量：${unit || "（指定なし）"}`;
  const { data } = await callJson({
    apiKey, model, system: NUTRITION_SYSTEM, userText, schema: NUTRITION_SCHEMA,
    maxTokens: 4000, effort: "low",
    tooLongMsg: "推定に失敗しました。もう一度試してください。",
  });
  return data;
}

function explainError(e, Anthropic) {
  if (Anthropic) {
    if (e instanceof Anthropic.AuthenticationError) return "APIキーが正しくありません（401）。設定画面でキーを確認してください。";
    if (e instanceof Anthropic.PermissionDeniedError) return "このAPIキーでは利用できません（403）。Consoleでキーの権限を確認してください。";
    if (e instanceof Anthropic.NotFoundError) return "選んだモデルが見つかりません（404）。設定画面で別のモデルを選んでください。";
    if (e instanceof Anthropic.RateLimitError) return "利用制限に達しました（429）。少し時間をおいて試すか、Consoleでクレジット残高を確認してください。";
    if (e instanceof Anthropic.BadRequestError) {
      return `リクエストに問題がありました（400）。クレジット残高不足のこともあるので、ConsoleのBillingも確認してください。\n詳細：${e.message}`;
    }
    if (e instanceof Anthropic.APIConnectionError) return "通信エラーです。インターネット接続を確認して、もう一度試してください。";
    if (e instanceof Anthropic.APIError) {
      if (e.status === 529 || e.status >= 500) return `AIサーバーが混み合っています（${e.status}）。少し時間をおいて試してください。`;
      return `APIエラー（${e.status}）：${e.message}`;
    }
  }
  return `エラーが発生しました：${e?.message || e}`;
}
