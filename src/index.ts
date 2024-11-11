import AWS from "aws-sdk";
import qs from "qs";
import axios from "axios";

const dynamoTable = "alexaveluxdb";

interface State {
  tokenData: TokenData | null;
  userData: UserData | null;
  settingsData: SettingsData | null;
  storedUserId: string | null;
}

interface TokenData {
  RefreshToken: string;
  AccessToken: string;
}

interface UserData {
  username: string;
  password: string;
  home_id: string;
  bridge: string;
}

interface SettingsData {
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

const state: State = {
  tokenData: null,
  userData: null,
  settingsData: null,
  storedUserId: null,
};

async function makeTokenRequest(
  grantType: "password" | "refresh_token"
): Promise<void> {
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
    const response = await axios.post(url, body, { headers });
    console.log(
      `Successfully got ${grantType} token from Velux backend: ${JSON.stringify(
        response.data
      )}`
    );
    await persistToken(response.data);
  } catch (error) {
    console.error(`Error making the ${grantType} token request:`, error);
  }
}

async function persistToken(token: any): Promise<void> {
  if (!state.storedUserId) throw new Error("User ID is not stored");
  const params = {
    TableName: dynamoTable,
    Item: {
      id: "token-" + state.storedUserId,
      RefreshToken: token.refresh_token,
      AccessToken: token.access_token,
    },
  };
  const context = await createDynamoDBContext();
  await context.put(params).promise();

  state.tokenData = {
    RefreshToken: token.refresh_token,
    AccessToken: token.access_token,
  };
}

async function createDynamoDBContext(): Promise<AWS.DynamoDB.DocumentClient> {
  const STS = new AWS.STS({ apiVersion: "2011-06-15" });
  const credentials = await STS.assumeRole({
    RoleArn: "arn:aws:iam::329599638967:role/HostedAlexaRole",
    RoleSessionName: "AlexaVeluxSession",
  }).promise();

  if (!credentials.Credentials) throw new Error("Failed to assume role");

  const dynamoDB = new AWS.DynamoDB.DocumentClient({
    apiVersion: "2012-08-10",
    accessKeyId: credentials.Credentials.AccessKeyId,
    secretAccessKey: credentials.Credentials.SecretAccessKey,
    sessionToken: credentials.Credentials.SessionToken,
  });

  return dynamoDB;
}

async function loadDBData(fromKey: string): Promise<any> {
  let cacheData;

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
      TableName: dynamoTable,
      Key: { id: fromKey },
    };

    const context = await createDynamoDBContext();
    const data = await context.get(params).promise();

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
      if (fromKey.startsWith("config-") || fromKey === "settings") {
        throw new Error(
          `Error loading config key ${fromKey} from DynamoDB. This is a fatal error. Aborting`
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
  if (!state.storedUserId) throw new Error("User ID is not set");
  state.settingsData = await loadDBData("settings");
  state.userData = await loadDBData("config-" + state.storedUserId);
  state.tokenData = await loadDBData("token-" + state.storedUserId);
}

async function persistUserId(
  code: string,
  userId: string,
  dynamoTable: string
): Promise<void> {
  const params = {
    TableName: dynamoTable,
    Item: {
      id: code,
      userId: userId,
    },
  };
  const context = await createDynamoDBContext();
  await context.put(params).promise();
}

async function postRequest(scenario: string): Promise<any> {
  try {
    return await makePostRequest(scenario);
  } catch (error: any) {
    if (error.response && error.response.status === 403) {
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
        return await makePostRequest(scenario);
      }
    }

    throw error;
  }
}

async function makePostRequest(scenario: string): Promise<any> {
  const { url, headers, jsonObject } = await constructRequestParams(scenario);
  return await axios.post(url, jsonObject, { headers });
}

function isTokenExpired(responseData: any): boolean {
  return (
    responseData.error &&
    responseData.error.code === 3 &&
    responseData.error.message === "Access token expired"
  );
}

function isTokenInvalid(responseData: any): boolean {
  return (
    responseData.error &&
    responseData.error.code === 2 &&
    responseData.error.message === "Invalid access_token"
  );
}

async function constructRequestParams(
  scenario: string
): Promise<{ url: string; headers: any; jsonObject: any }> {
  if (!state.settingsData || !state.userData || !state.tokenData) {
    throw new Error("State data is incomplete");
  }

  console.log("State: " + JSON.stringify(state, null, 2));

  const url = state.settingsData.base_url + state.settingsData.sync_url;
  const headers = {
    Authorization: "Bearer " + state.tokenData.AccessToken,
    "Content-Type": "application/json",
  };
  const jsonObject = {
    home: {
      id: state.userData.home_id,
      modules: [
        {
          scenario: scenario,
          bridge: state.userData.bridge,
          id: state.userData.bridge,
        },
      ],
    },
    app_version: state.settingsData.app_version,
  };

  return { url, headers, jsonObject };
}

export { persistUserId, postRequest, warmUp, state };
