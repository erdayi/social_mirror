const DEFAULT_SECONDME_API_BASE_URL = 'https://api.mindverse.com/gate/lab'
const DEFAULT_SECONDME_OAUTH_URL = 'https://go.second.me/oauth/'
const DEFAULT_APP_URL = 'http://localhost:3000'

function getNumberEnv(name: string, fallback: number) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
  secondMe: {
    clientId: process.env.SECONDME_CLIENT_ID || '',
    clientSecret: process.env.SECONDME_CLIENT_SECRET || '',
    redirectUri:
      process.env.SECONDME_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL}/auth/callback`,
    apiBaseUrl:
      process.env.SECONDME_API_BASE_URL || DEFAULT_SECONDME_API_BASE_URL,
    oauthUrl: DEFAULT_SECONDME_OAUTH_URL,
  },
  simulation: {
    tickIntervalMs: getNumberEnv('SIM_TICK_INTERVAL_MS', 20_000),
    minWorldAgentCount: getNumberEnv('MIN_WORLD_AGENT_COUNT', 10),
  },
}

export function hasSecondMeCredentials() {
  return Boolean(env.secondMe.clientId && env.secondMe.clientSecret)
}
