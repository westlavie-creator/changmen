/** 皇冠跟单队列（common API，key=HG:{agentId}） */
export async function getHgFollowOrders(agentId: string) {
  const res = await fetch(`/common/API_GetData?key=${encodeURIComponent(`HG:${agentId}`)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok)
    throw new Error(`HG follow HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? data : [];
}
