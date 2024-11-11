interface RequestHeaders {
  Authorization: string;
  "Content-Type": string;
}
interface Module {
  scenario: string;
  bridge: string;
  id: string;
}
interface Home {
  id: string;
  modules: Module[];
}
export interface RequestBody {
  home: Home;
  app_version: string;
}
export interface State {
  tokenData: TokenData | null;
  userData: UserData | null;
  settingsData: SettingsData | null;
  storedUserId: string | null;
}
export interface Token {
  refresh_token: string;
  access_token: string;
}
export interface ErrorResponseData {
  error: {
    code: number;
    message: string;
  };
}
export interface TokenData {
  RefreshToken: string;
  AccessToken: string;
}
export interface UserData {
  username: string;
  password: string;
  home_id: string;
  bridge: string;
}
export interface SettingsData {
  base_url: string;
  token_url: string;
  authorization: string;
  app_identifier: string;
  device_model: string;
  device_name: string;
  scope: string;
  user_prefix: string;
  sync_url: string;
  app_version: string;
}
