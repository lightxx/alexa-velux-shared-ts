import AWS from "aws-sdk";
import qs from "qs";
import axios, { AxiosError, AxiosHeaders, AxiosResponse } from "axios";
import {
  State,
  Token,
  SettingsData,
  UserData,
  TokenData,
  ErrorResponseData,
  ActionRequestBody,
  BaseRequestBody,
  HomeRequestBody,
  Table,
  AccessToken,
  SkillType,
  VeluxCredentials,
  HomeStatusRequestBody,
} from "./interfaces/interfaces.mjs";
import { ConfigurationEntry } from "./interfaces/ConfigurationEntry.mjs";
import { HomeStatus } from "./interfaces/HomeStatus.mjs";

const indexName = "userID-index";
const attributeName = "userId";

const state: State = {
  tokenData: null,
  userData: null,
  settingsData: null,
  storedUserId: null,
  skillType: null,
};

enum Action {
  RUN_SCENARIO = "run-scenario",
  HOME_INFO = "home-info",
  HOME_STATUS = "home-status",
}

async function makeTokenRequest(grantType: "password" | "refresh_token"): Promise<TokenData> {
  try {
    if (!state.settingsData) throw new Error("Settings data is missing");
    const url = state.settingsData.base_url + state.settingsData.token_url;
    const headers = {
      Authorization: state.settingsData.authorization,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    let body;
    const baseBody = {
      grant_type: grantType,
    };

    if (grantType === "password" && state.userData) {
      body = qs.stringify({
        ...baseBody,
        app_identifier: state.settingsData.app_identifier,
        device_model: state.settingsData.device_model,
        device_name: state.settingsData.device_name,
        password: state.userData.password,
        scope: state.settingsData.scope,
        user_prefix: state.settingsData.user_prefix,
        username: state.userData.username,
      });
    } else if (grantType === "refresh_token" && state.tokenData) {
      body = qs.stringify({
        ...baseBody,
        refresh_token: state.tokenData.RefreshToken,
      });
    } else {
      throw new Error("Invalid grant type or missing user/token data");
    }

    console.log(`trying to get ${grantType} token from Velux backend...`);
    console.log(`url: ${url}, body: ${body}, headers: ${JSON.stringify(headers)}`);
    const response = await axios.post<Token>(url, body, { headers });
    console.log(`Successfully got ${grantType} token from Velux backend: ${JSON.stringify(response.data)}`);

    state.tokenData = {
      RefreshToken: response.data.refresh_token,
      AccessToken: response.data.access_token,
    };

    const credentials: VeluxCredentials = {
      ...response.data, 
      username: state.userData!.username,
      password: state.userData!.password,
    };

    await persistToken(credentials);

    return state.tokenData;
  } catch (error) {
    const msg = `Error making the ${grantType} token request: ${error}`;
    console.error(msg);
    throw msg;
  }
}

async function persistToken(veluxCredentials: VeluxCredentials): Promise<void> {
  if (!state.skillType) {
    throw "state.skillType must be set to persist the token!"
  }

  const dynamoDb = new AWS.DynamoDB.DocumentClient();

  if (state.skillType === SkillType.Custom) {
    if (!state.storedUserId) {
      throw "state.storedUserId must be set to persist the token!";
    }
    const params = {
      TableName: Table.CONFIG,
      Item: {
        id: "token-" + state.storedUserId,
        RefreshToken: veluxCredentials.refresh_token,
        AccessToken: veluxCredentials.access_token,
      },
    };
    await dynamoDb.put(params).promise();
  } else {
   
    const params = {
      TableName: Table.USER,
      Key: {
        username:veluxCredentials.username, 
      },
      UpdateExpression: "SET access_token = :accessToken, refresh_token = :refreshToken",
      ExpressionAttributeValues: {
        ":accessToken": veluxCredentials.access_token, 
        ":refreshToken": veluxCredentials.refresh_token, 
      },
      ConditionExpression: "attribute_exists(username)", 
      ReturnValues: "ALL_NEW", 
    };

    console.log("Trying to update DB with: " + JSON.stringify(params, null, 2))

    dynamoDb.update(params, (err, data) => {
      if (err) {
        console.error("Error updating item:", err);
      } else {
        console.log("Successfully updated item:", data.Attributes);
      }
    });
  }
}

async function findKeyByValue(userId: string) {
  return await findKeyByValueUsingGSI(Table.CONFIG, indexName, attributeName, userId);
}

async function findKeyByValueUsingGSI(
  tableName: string,
  indexName: string,
  attributeName: string,
  attributeValue: string
): Promise<string | null> {
  const params = {
    TableName: tableName,
    IndexName: indexName,
    KeyConditionExpression: "#attr = :value",
    ExpressionAttributeNames: {
      "#attr": attributeName,
    },
    ExpressionAttributeValues: {
      ":value": attributeValue,
    },
    ProjectionExpression: "id",
  };

  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  const data = await dynamoDb.query(params).promise();
  if (data.Items && data.Items.length > 0) {
    return data.Items[0].id;
  }
  return null;
}

async function loadDBData(fromKey: string): Promise<SettingsData | UserData | TokenData | null> {
  let cacheData: SettingsData | UserData | TokenData | null = null;

  if (fromKey.startsWith("token-")) {
    cacheData = state.tokenData;
  } else if (fromKey.startsWith("config-")) {
    cacheData = state.userData;
  } else {
    cacheData = state.settingsData;
  }

  if (!cacheData) {
    console.log(`Loading ${fromKey} data from DynamoDB...`);
    const params = {
      TableName: Table.CONFIG,
      Key: { id: fromKey },
    };

    const dynamoDb = new AWS.DynamoDB.DocumentClient();
    const data = await dynamoDb.get(params).promise();

    if (data.Item) {
      if (fromKey.startsWith("token-")) {
        state.tokenData = data.Item as TokenData;
        cacheData = state.tokenData;
      } else if (fromKey.startsWith("config-")) {
        state.userData = data.Item as UserData;
        cacheData = state.userData;
      } else {
        state.settingsData = data.Item as SettingsData;
        cacheData = state.settingsData;
      }
    } else {
      if (fromKey === "settings") {
        throw new Error(`Error loading config key ${fromKey} from DynamoDB. This is a fatal error. Aborting`);
      } else if (fromKey.startsWith("config-")) {
        console.log(
          `No user settings found in DynamoDB. This might happen if the SetupEnvironmentIntentHandler hasn't run yet.`
        );
      } else {
        console.log(`No token found in DynamoDB, trying Velux backend...`);
        await makeTokenRequest("password");
      }
    }
  } else {
    console.log(`Using cached ${fromKey} data.`);
  }

  return cacheData;
}

async function warmUp(): Promise<void> {
  state.skillType = SkillType.Custom;
  state.settingsData = (await loadDBData("settings")) as SettingsData;
  if (state.storedUserId) {
    state.userData = (await loadDBData("config-" + state.storedUserId)) as UserData;
  }
  if (state.userData) {
    state.tokenData = (await loadDBData("token-" + state.storedUserId)) as TokenData;
  }
}

async function warmUpSmartHome(token: string): Promise<void> {
  state.skillType = SkillType.SmartHome
  state.settingsData = (await loadDBData("settings")) as SettingsData;

  const credentials = await getVeluxUserCredentials(token);
  state.userData = credentials;
  state.tokenData = { RefreshToken: credentials.refresh_token!, AccessToken: credentials.access_token! };
}

async function persistUserId(code: string): Promise<void> {
  const params = {
    TableName: Table.CONFIG,
    Item: {
      id: code,
      userId: state.storedUserId,
    },
  };
  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  await dynamoDb.put(params).promise();
}

async function handleTokenRefreshIfNeeded(error: AxiosError<ErrorResponseData>): Promise<boolean> {
  console.log("handleTokenRefreshIfNeeded was called with: " + JSON.stringify(error, null, 2));

  if (error.response && error.response.status === 403) {
    console.log("error.response.data is: " + JSON.stringify(error.response.data, null, 2));
    const responseData = error.response.data;

    let tokenType: "password" | "refresh_token" | undefined;

    if (isTokenExpired(responseData)) {
      console.log("Access token expired, refreshing token...");
      tokenType = "refresh_token";
    } else if (isTokenInvalid(responseData)) {
      console.log("Invalid access token, creating initial token request...");
      tokenType = "password";
    }

    if (tokenType) {
      await makeTokenRequest(tokenType);
      return true;
    }
  }

  return false;
}

async function retryIfNeeded<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {      
      const shouldRetry = await handleTokenRefreshIfNeeded(error as AxiosError<ErrorResponseData>);
      if (shouldRetry) {
        return await action();
      }
    }
    throw error;
  }
}

async function getVeluxUserCredentials(token: string): Promise<UserData> {
  let params = {
    TableName: Table.TOKEN,
    Key: { token: token },
  };

  const dynamoDb = new AWS.DynamoDB.DocumentClient();
  const tokenData = await dynamoDb.get(params).promise();

  if (!tokenData.Item) {
    throw "Error retrieving data for the specified token " + token;
  }

  const accessToken = tokenData.Item as AccessToken;

  const lookupParams = {
    TableName: Table.USER,
    Key: { username: accessToken.veluxUserId },
  };

  const userData = await dynamoDb.get(lookupParams).promise();

  if (!userData.Item) {
    throw "Error retrieving Velux user credentials for the specified user " + accessToken.veluxUserId;
  }

  const user = userData.Item as UserData;

  console.log("Loaded user data from DynamoDB: " + JSON.stringify(user, null, 2));

  return user;
}

async function getHomeInfo(): Promise<AxiosResponse<ConfigurationEntry>> {
  const { url, headers, jsonObject } = await constructRequestParams(Action.HOME_INFO);
  return await axios.post(url, jsonObject, { headers });
}
async function getHomeStatus(): Promise<AxiosResponse<HomeStatus>> {
  const { url, headers, jsonObject } = await constructRequestParams(Action.HOME_STATUS);
  return await axios.post(url, jsonObject, { headers });
}

async function sendScenarioRequest(scenario: string): Promise<AxiosResponse<any>> {
  const { url, headers, jsonObject } = await constructRequestParams(Action.RUN_SCENARIO, scenario);
  return await axios.post(url, jsonObject, { headers });
}

function isTokenExpired(responseData: ErrorResponseData): boolean {
  return responseData.error && responseData.error.code === 3;
}

function isTokenInvalid(responseData: ErrorResponseData): boolean {
  return responseData.error && responseData.error.code === 2;
}

async function constructRequestParams(
  action: Action,
  scenario?: string
): Promise<{ url: string; headers: AxiosHeaders; jsonObject: BaseRequestBody }> {
  if (!state.settingsData || !state.userData || !state.tokenData) {
    throw new Error("State data is incomplete");
  }

  console.log("State: " + JSON.stringify(state, null, 2));

  let url: string = "";

  const headers = new AxiosHeaders();
  headers.set("Authorization", `Bearer ${state.tokenData.AccessToken}`);
  headers.set("Content-Type", "application/json");

  let jsonObject: BaseRequestBody;

  switch (action) {
    case Action.RUN_SCENARIO:
      if (!scenario) {
        throw new Error("Scenario name must be provided for 'run-scenario' action");
      }

      const actionRequestBody: ActionRequestBody = {
        home: {
          id: state.userData.home_id!,
          modules: [
            {
              scenario: scenario,
              bridge: state.userData.bridge!,
              id: state.userData.bridge!,
            },
          ],
        },
        app_version: state.settingsData.app_version,
      };
      jsonObject = actionRequestBody;
      url = state.settingsData.base_url + state.settingsData.sync_url;
      break;

    case Action.HOME_INFO:
      const homeRequestBody: HomeRequestBody = {
        app_version: state.settingsData.app_version,
        app_type: state.settingsData.app_type,
        sync_measurements: true,
      };
      jsonObject = homeRequestBody;
      url = state.settingsData.base_url + state.settingsData.homesdata_url;
      break;

      case Action.HOME_STATUS:
        const statusRequestBody: HomeStatusRequestBody = {
          app_version: state.settingsData.app_version,
          home_id: state.userData.home_id!,
        };
        jsonObject = statusRequestBody;
        url = state.settingsData.base_url + state.settingsData.status_url;
        break;
    default:
      throw new Error("Invalid action type");
  }

  return { url, headers, jsonObject };
}

async function getHomeInfoWithRetry(): Promise<AxiosResponse<ConfigurationEntry>> {
  return retryIfNeeded(() => getHomeInfo());
}

async function getHomeStatusWithRetry(): Promise<AxiosResponse<HomeStatus>> {
  return retryIfNeeded(() => getHomeStatus());
}

async function sendScenarioRequestWithRetry(scenario: string): Promise<AxiosResponse<any>> {
  return retryIfNeeded(() => sendScenarioRequest(scenario));
}

export {
  persistUserId,
  warmUp,
  warmUpSmartHome,
  makeTokenRequest,
  findKeyByValue,
  getHomeInfoWithRetry,
  sendScenarioRequestWithRetry,
  getHomeStatusWithRetry,
  getVeluxUserCredentials,
  state,
  ConfigurationEntry,
  Table,
};
