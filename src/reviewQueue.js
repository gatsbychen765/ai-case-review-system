export const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));
export async function requestWithRetry(request, onWait = () => {}, pause = wait) {
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    let data;
    try { data = await response.json(); } catch { throw new Error("评审服务未返回有效JSON，请检查服务连接。"); }
    if (response.ok) return data;
    if (!data.retryable || attempt >= 2) throw Object.assign(new Error(data.error || "评审失败"), { status: response.status, kind: data.kind });
    const seconds = Math.max(5, Number(data.retryAfter) || 15) * (attempt + 1);
    // A long provider cooling window pauses the queue instead of repeatedly sending.
    if (seconds > 120) throw Object.assign(new Error(`服务商要求等待${seconds}秒，请稍后继续。`), { status: 429, kind: "rate_limit" });
    onWait(seconds, attempt + 1);
    await pause(seconds);
  }
}
