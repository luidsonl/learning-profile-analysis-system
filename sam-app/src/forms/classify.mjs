import { CMD, client, TABLE } from "../lib/db.mjs";
import { getFormProcessor, getFormDefinition } from "./engine.mjs";

export const latestSubmission = async (studentId, formId) => {
  const res = await client.send(
    new CMD.query({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ScanIndexForward: false,
      Limit: 1,
      ExpressionAttributeValues: { ":pk": { S: `STUDENT#${studentId}` }, ":sk": { S: `SUBMISSION#${formId}#` } },
    }),
  );
  return res.Items?.[0] ?? null;
};

export const classifyLatestSubmission = async (studentId, formId) => {
  const submission = await latestSubmission(studentId, formId);
  if (!submission) return null;

  const form = getFormDefinition(formId);
  const processor = getFormProcessor(formId);
  const answers = JSON.parse(submission.answers.S);
  const scored = processor?.score ? processor.score(form, answers) : { scores: null, label: null };

  return {
    ...scored,
    formId,
    formVersion: Number(submission.formVersion.S),
    submission: submission.SK.S,
  };
};
