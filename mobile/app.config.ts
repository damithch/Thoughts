import { existsSync } from "node:fs";

import type { ConfigContext, ExpoConfig } from "expo/config";

// app.json holds the config. This only adds Firebase (for server push) when a
// google-services.json is present: the CI build writes it from a repository secret; it's never
// committed, so builds without it simply have no server push.
export default ({ config }: ConfigContext): ExpoConfig => {
  const hasFirebase = existsSync("./google-services.json");

  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      ...(hasFirebase ? { googleServicesFile: "./google-services.json" } : {}),
    },
  };
};
