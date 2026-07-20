export interface FeishuConfig {
  appId: string;
  appSecret: string;
  wikiSpaceId?: string;
}

export interface FeishuPage {
  pageToken: string;
  title: string;
  updatedAt: string;
}
