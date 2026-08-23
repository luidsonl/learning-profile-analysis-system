import { api, expect, pollUntil, step } from "../helpers.mjs";

// Machine-learning inference on form submission: the Forms handler async-invokes
// the InferenceFunction after storing a vark-kids submission; that function
// scores with its bundled model and writes a PRED# item linked to the submission.
export default async (ctx) => {
  step("ml: automatic inference arrives after vark submission");
  {
    const preds = await pollUntil(
      () => api("GET", `/children/${ctx.childId}/predictions`, { token: ctx.guardianToken }),
      { tries: 15 },
    ).then((r) => (r && r.status === 200 && r.data.count >= 1 ? r.data : null));
    expect("auto prediction arrived", !!preds, JSON.stringify(preds || { count: 0 }));

    const p = preds?.data?.[0];
    expect("prediction is ml-generated with model metadata", p && ["R", "A", "K"].includes(p.label) && p.method === "ml" && !!p.model && !!p.modelVersion, JSON.stringify(p));

    const scores = p?.scores;
    const sum = scores ? Object.values(scores).reduce((a, b) => a + b, 0) : -1;
    expect(
      "scores form a valid probability distribution",
      scores && ["R", "A", "K"].every((k) => typeof scores[k] === "number") && Math.abs(sum - 1) < 0.01 && p.confidence >= 0 && p.confidence <= 1,
      JSON.stringify(p),
    );
  }

  step("ml: prediction is attached to the originating submission");
  {
    const resp = await pollUntil(async () => {
      const r = await api("GET", `/children/${ctx.childId}/forms/vark-kids/responses`, { token: ctx.guardianToken });
      const subs = r.status === 200 ? r.data?.data || [] : [];
      return subs.length > 0 && subs.every((s) => s.prediction) ? r : null;
    }, { tries: 15 });
    const subs = resp?.data?.data || [];
    expect("responses list fetched", resp?.status === 200 && subs.length === 2, JSON.stringify(resp?.data?.count));

    const target = subs.find((s) => s.submissionId === ctx.varkSubmissionId);
    expect(
      "student submission carries its ml prediction",
      target && target.prediction && target.prediction.method === "ml" && target.prediction.label && target.prediction.predictionId,
      JSON.stringify(target?.prediction),
    );

    const assisted = subs.find((s) => s.submissionId !== ctx.varkSubmissionId);
    expect("guardian-assisted submission also scored", assisted && assisted.prediction && assisted.prediction.method === "ml", JSON.stringify(assisted?.prediction));
  }

  step("ml: non-inference forms are not scored");
  {
    const ana = await api("GET", `/children/${ctx.childId}/forms/anamnesis/responses`, { token: ctx.guardianToken });
    const item = ana.data?.data?.[0];
    expect(
      "anamnesis response has no prediction",
      ana.status === 200 && ana.data.count >= 1 && item.submissionId === ctx.anamnesisSubmissionId && item.prediction === null,
      JSON.stringify(item),
    );
  }

  step("ml: supervised student sees label-only predictions");
  {
    const lst = await pollUntil(
      () => api("GET", `/children/${ctx.childId}/predictions`, { token: ctx.studentToken }),
      { tries: 15 },
    ).then((r) => (r && r.status === 200 && r.data.count >= 1 ? r.data : null));
    expect("supervised prediction list arrives", !!lst, JSON.stringify(lst || { count: 0 }));
    expect("supervised prediction is label-only", lst?.data?.[0]?.scores === undefined && lst?.data?.[0]?.confidence === undefined, JSON.stringify(lst?.data?.[0]));

    const own = await api("GET", `/children/${ctx.childId}/forms/vark-kids/responses`, { token: ctx.studentToken });
    const ownPred = own.data?.data?.find((s) => s.submissionId === ctx.varkSubmissionId)?.prediction;
    expect("supervised responses hide scores too", ownPred && ownPred.scores === undefined && ownPred.confidence === undefined && !!ownPred.label, JSON.stringify(ownPred));
  }

  step("ml: predictions do not bundle recommendations");
  {
    const recs = await api("GET", `/children/${ctx.childId}/recommendations`, { token: ctx.guardianToken });
    expect("no recommendations bundled with prediction", recs.status === 200 && recs.data.count === 0, JSON.stringify(recs.data));
  }
};
