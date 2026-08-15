export const lambdaHandler = async (event) => {
  console.log("feature-export received", JSON.stringify(event));
  return {
    statusCode: 200,
  };
};
