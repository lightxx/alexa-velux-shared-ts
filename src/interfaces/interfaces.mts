export enum Table {

  AUTH = "OAuthAuthorizationCodes",
  TOKEN = "OAuthAccessTokens",
  USER = "veluxusers",
  CONFIG = "alexaveluxdb"
}

export enum SkillType {
  Custom = "CustomSkill",
  SmartHome = "SmartHomeSkill"
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

export interface BaseRequestBody {
  app_version: string;
}

export interface HomeStatusRequestBody extends BaseRequestBody {
  home_id: string;
}
export interface ActionRequestBody extends BaseRequestBody {
  home: Home;
}

export interface HomeRequestBody extends BaseRequestBody {
  sync_measurements: Boolean;
  app_type: String;
}

export interface State {
  skillType: SkillType | null;
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
export interface AccessToken {
  token: string;
  veluxUserId: string;
}

export interface TokenData {
  RefreshToken: string;
  AccessToken: string;
}

export interface VeluxCredentials {
  username: string;
  password: string;
  access_token: string | null;
  refresh_token: string | null;
}
export interface UserData extends VeluxCredentials {
  home_id: string | null;
  bridge: string | null;
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
  app_type: string;
  homesdata_url: string;
  status_url: string;
}
