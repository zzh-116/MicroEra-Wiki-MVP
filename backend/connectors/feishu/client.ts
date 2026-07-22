import { getToken } from "./auth.js";
import { config } from "../../config.js";

const BASE = "https://open.feishu.cn/open-apis";

export async function listWikiPages(spaceId: string) {
  const token = await getToken(config.feishu.appId, config.feishu.appSecret);
  var pages = [];
  var pageToken = "";
  while (true) {
    var url = BASE + "/wiki/v2/spaces/" + spaceId + "/nodes?page_size=50";
    if (pageToken) url = url + "&page_token=" + pageToken;
    var res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    var raw = await res.text();
    var data: any;
    try { data = JSON.parse(raw); } catch {
      throw new Error(`Feishu Wiki API: invalid JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }
    if (data.code !== 0) {
      throw new Error(`Feishu Wiki API error: code=${data.code} msg=${data.msg} (HTTP ${res.status})`);
    }
    for (var item of (data.data?.items || [])) {
      pages.push({ pageToken: item.node_token, title: item.title || "", updatedAt: item.obj_edit_time || "" });
    }
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || "";
  }
  return pages;
}

export async function listSpaces() {
  const token = await getToken(config.feishu.appId, config.feishu.appSecret);
  var spaces = [];
  var pageToken = "";
  while (true) {
    var url = BASE + "/wiki/v2/spaces?page_size=20";
    if (pageToken) url = url + "&page_token=" + pageToken;
    var res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    var raw = await res.text();
    var data: any;
    try { data = JSON.parse(raw); } catch {
      throw new Error(`Feishu Space List: invalid JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`);
    }
    if (data.code !== 0) {
      throw new Error(`Feishu Space List error: code=${data.code} msg=${data.msg}`);
    }
    for (var item of (data.data?.items || [])) {
      spaces.push({ spaceId: item.space_id, name: item.name || "", description: item.description || "" });
    }
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || "";
  }
  return spaces;
}

export async function getDocumentContent(documentToken: string): Promise<string> {
  const token = await getToken(config.feishu.appId, config.feishu.appSecret);
  var res = await fetch(BASE + "/docx/v1/documents/" + documentToken + "/raw_content", {
    headers: { Authorization: "Bearer " + token },
  });
  var data = await res.json();
  return data.data?.content || "";
}
