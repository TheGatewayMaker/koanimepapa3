import serverless from "serverless-http";

import { createServer } from "../../server";

export const handler = serverless(createServer(), {
  basePath: "/.netlify/functions/api",
});
