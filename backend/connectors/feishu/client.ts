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
    var data = await res.json();
    if (data.code !== 0) break;
    for (var item of (data.data?.items || [])) {
      pages.push({ pageToken: item.node_token, title: item.title || "", updatedAt: item.obj_edit_time || "" });
    }
    if (!data.data?.has_more) break;
    pageToken = data.data?.page_token || "";
  }
  return pages;
}

export async function getDocumentContent(documentToken: string): Promise<string> {
  const token = await getToken(config.feishu.appId, config.feishu.appSecret);
  var res = await fetch(BASE + "/docx/v1/documents/" + documentToken + "/raw_content", {
    headers: { Authorization: "Bearer " + token },
  });
  var data = await res.json();
  return data.data?.content || "";
}
