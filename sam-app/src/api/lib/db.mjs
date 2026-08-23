import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

const endpoint = process.env.DYNAMODB_ENDPOINT || undefined;

export const client = new DynamoDBClient({
  endpoint,
  region: process.env.AWS_REGION || process.env.REGION || "us-east-1",
});

export const CMD = {
  get: GetItemCommand,
  put: PutItemCommand,
  update: UpdateItemCommand,
  delete: DeleteItemCommand,
  query: QueryCommand,
  scan: ScanCommand,
  transact: TransactWriteItemsCommand,
};

export const TABLE = process.env.TABLE_NAME || "learning-profile";

export const expr = {
  names: (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`#${k}`, v])),
  values: (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [`:${k}`, v])),
};
