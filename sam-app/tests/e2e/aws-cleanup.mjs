import {
  DynamoDBClient,
  QueryCommand,
  GetItemCommand,
  DeleteItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

const TABLE = process.env.TABLE_NAME || "learning-profile";
const client = new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" });

export async function deletePartition(pk) {
  let last = undefined;
  do {
    const res = await client.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: pk } },
        ExclusiveStartKey: last,
      }),
    );
    for (const item of res.Items || []) {
      await client.send(new DeleteItemCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
    }
    last = res.LastEvaluatedKey;
  } while (last);
}

export async function deleteItem(pk, sk) {
  try {
    await client.send(new DeleteItemCommand({ TableName: TABLE, Key: { PK: { S: pk }, SK: { S: sk } } }));
  } catch {
    /* best effort */
  }
}

export async function findUserByEmail(email) {
  const res = await client.send(
    new GetItemCommand({ TableName: TABLE, Key: { PK: { S: `EMAIL#${email}` }, SK: { S: `EMAIL#${email}` } } }),
  );
  return res.Item?.userId?.S || null;
}

export async function findStudentsByCreator(userId) {
  const found = [];
  let last = undefined;
  do {
    const res = await client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "RoleStatus",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: "STUDENT#STATUS#active" } },
        ExclusiveStartKey: last,
      }),
    );
    for (const item of res.Items || []) {
      if (item.createdBy?.S === userId && item.studentId?.S) found.push(item.studentId.S);
    }
    last = res.LastEvaluatedKey;
  } while (last);
  return found;
}

export async function cleanupUser(userId, email) {
  if (!userId) return;
  await deletePartition(`USER#${userId}`);
  if (email) await deleteItem(`EMAIL#${email}`, `EMAIL#${email}`);
  await deletePartition(`AUDIT#USER#${userId}`);
}

// Deletes the session identified by a token the test itself obtained. Uses the
// Lookup GSI (composite key, queried by GSI1PK exactly like getSession does).
export async function deleteSessionByToken(token) {
  if (!token) return;
  let last = undefined;
  do {
    const res = await client.send(
      new QueryCommand({
        TableName: TABLE,
        IndexName: "Lookup",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": { S: `SESSION#${token}` } },
        ExclusiveStartKey: last,
      }),
    );
    for (const item of res.Items || []) {
      await client.send(new DeleteItemCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
    }
    last = res.LastEvaluatedKey;
  } while (last);
}

// Removes sessions whose owning user no longer exists — the only orphan
// sessions in a test/seed-only table are leftovers this test's runs created.
export async function purgeOrphanSessions() {
  let last = undefined;
  let removed = 0;
  do {
    const res = await client.send(
      new ScanCommand({
        TableName: TABLE,
        IndexName: "Lookup",
        ProjectionExpression: "PK, SK, GSI1SK",
        ExclusiveStartKey: last,
      }),
    );
    for (const item of res.Items || []) {
      const owner = item.GSI1SK?.S;
      if (!owner || !owner.startsWith("USER#")) continue;
      const user = await client.send(
        new GetItemCommand({ TableName: TABLE, Key: { PK: { S: owner }, SK: { S: "META" } } }),
      );
      if (!user.Item) {
        await client.send(new DeleteItemCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
        removed += 1;
      }
    }
    last = res.LastEvaluatedKey;
  } while (last);
  return removed;
}

export async function cleanupStudent(studentId) {
  if (!studentId) return;
  await deletePartition(`STUDENT#${studentId}`);
  await deletePartition(`CONSENT#${studentId}`);
  await deletePartition(`AUTONOMY#${studentId}`);
  await deletePartition(`PRED#${studentId}`);
  await deletePartition(`ASSESS#${studentId}`);
  await deletePartition(`REPORT#${studentId}`);
  await deletePartition(`AUDIT#STUDENT#${studentId}`);
}

export const CLEANUP_TABLE = TABLE;
