// Deletes items from the single table whose PK starts with one of the given
// prefixes (default: legacy MODEL#/FORM# orphans). --all wipes everything and
// requires CONFIRM=yes. Reads TABLE_NAME / AWS_REGION from the environment.
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE = process.env.TABLE_NAME || "learning-profile";
const REGION = process.env.AWS_REGION || "us-east-1";
const client = new DynamoDBClient({ region: REGION });

const args = process.argv.slice(2);
const wipeAll = args.includes("--all");

if (wipeAll && process.env.CONFIRM !== "yes") {
  console.error(`--all deletes EVERY item in "${TABLE}". Re-run with CONFIRM=yes to proceed.`);
  process.exit(2);
}

let prefixes = args.filter((a) => !a.startsWith("--"));
if (!wipeAll && prefixes.length === 0) prefixes = ["MODEL#", "FORM#"];

console.log(`table=${TABLE} region=${REGION}`);
console.log(wipeAll ? "mode=WIPE-ALL" : `prefixes=${prefixes.join(" ")}`);

// Paginated scan; with prefixes, server-side filter keeps transfers small.
async function* scanItems() {
  let last;
  do {
    const cmd = { TableName: TABLE, ExclusiveStartKey: last };
    if (!wipeAll) {
      const names = [];
      const values = {};
      cmd.FilterExpression = prefixes.map((p, i) => {
        names.push(`:p${i}`);
        values[`:p${i}`] = { S: p };
        return `begins_with(PK, :p${i})`;
      }).join(" OR ");
      cmd.ExpressionAttributeValues = values;
    }
    const res = await client.send(new ScanCommand(cmd));
    yield* res.Items || [];
    last = res.LastEvaluatedKey;
  } while (last);
}

let deleted = 0;
for await (const item of scanItems()) {
  await client.send(new DeleteItemCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } }));
  deleted += 1;
  if (process.env.VERBOSE) console.log(`deleted ${item.PK.S} | ${item.SK.S}`);
}

console.log(`done: ${deleted} item(s) removed`);
