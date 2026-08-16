import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { CMD, client, TABLE } from "./db.mjs";
import { ttlSeconds } from "./ids.mjs";

const SESSION_TTL_SECONDS = 7 * 24 * 3600;

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const genToken = () => randomBytes(32).toString("hex");

export const getUserByEmail = async (email) => {
  const normalized = email.trim().toLowerCase();
  const res = await client.send(
    new CMD.get({
      TableName: TABLE,
      Key: { PK: { S: `EMAIL#${normalized}` }, SK: { S: `EMAIL#${normalized}` } },
    }),
  );
  const reservation = res.Item;
  if (!reservation) return null;
  const userId = reservation.userId.S;
  const userRes = await client.send(
    new CMD.get({
      TableName: TABLE,
      Key: { PK: { S: `USER#${userId}` }, SK: { S: "META" } },
    }),
  );
  if (!userRes.Item) return null;
  return { userId, ...unmarshall(userRes.Item) };
};

export const getUser = async (userId) => {
  const res = await client.send(
    new CMD.get({
      TableName: TABLE,
      Key: { PK: { S: `USER#${userId}` }, SK: { S: "META" } },
    }),
  );
  return res.Item ? { userId, ...unmarshall(res.Item) } : null;
};

export const getSession = async (token) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      IndexName: "Lookup",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": { S: `SESSION#${token}` } },
      Limit: 1,
    }),
  );
  return res.Items?.[0] ?? null;
};
