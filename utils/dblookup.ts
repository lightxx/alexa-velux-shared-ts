import AWS from 'aws-sdk';
AWS.config.update({region:'eu-west-1'});

const dynamoDb = new AWS.DynamoDB.DocumentClient();

async function findKeyByValueUsingGSI(tableName: string, indexName: string, attributeName: string, attributeValue: string) {
  const params = {
    TableName: tableName,
    IndexName: indexName, 
    KeyConditionExpression: "#attr = :value",
    ExpressionAttributeNames: {
      "#attr": attributeName
    },
    ExpressionAttributeValues: {
      ":value": attributeValue
    },
    ProjectionExpression: "id" // Only return the key attribute, e.g., "id"
  };

  const data = await dynamoDb.query(params).promise();
  if (data.Items && data.Items.length > 0) {
    return data.Items[0].id; // Return the key (assuming 'id' is the key name)
  }
  return null; // Not found
}

// Example usage:
(async () => {
  const tableName = "alexaveluxdb";
  const indexName = "userID-index"; // The name of the GSI you created
  const attributeName = "userId";
  const attributeValue = "amzn1.ask.account.AMAX7YO47IZAAEMYRWGA5AFDQ3NQDK22UOUTVTPDVI4O6IVW4JOS7XWVN4RCENE7UJNE5AWIXRRP2NK3MMYUT5GS63YSFJPYAA77O6Z4RJVUSNJQ76CZLFK4SFZ52QFSUXJSJDKBFDFEVANXONQODJR75W6Y6CZ6ZFT35QIXAY75YE4RJF72MYNNZJFNGG2RXZR5BPROI3ROSBJXQHFYFZUA4HH7H24O7WP6CP3OIHUA";

  const key = await findKeyByValueUsingGSI(tableName, indexName, attributeName, attributeValue);
  if (key) {
    console.log("Found key:", key);
  } else {
    console.log("Value not found.");
  }
})();
