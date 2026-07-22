const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
let _token: string | null = null;
let _expire = 0;

export async function getToken(appId: string, appSecret: string): Promise<string> {
  if (_token && Date.now() < _expire) return _token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Feishu auth: invalid JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (data.code !== 0) throw new Error(`Feishu auth failed: ${data.code} ${data.msg}`);
  _token = data.tenant_access_token;
  _expire = Date.now() + (data.expire - 60) * 1000;
  return _token!;
}
