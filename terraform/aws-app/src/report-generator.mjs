export const lambdaHandler = async (event) => {
  console.log("report-generator received", JSON.stringify(event));
  return {
    batchItemFailures: [],
  };
};
