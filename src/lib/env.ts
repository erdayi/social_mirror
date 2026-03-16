const DEFAULT_SECONDME_API_BASE_URL = 'https://api.mindverse.com/gate/lab'
const DEFAULT_SECONDME_OAUTH_URL = 'https://go.second.me/oauth/'
const DEFAULT_APP_URL = 'http://localhost:3000'
const DEFAULT_ZHIHU_API_BASE_URL = 'https://openapi.zhihu.com'

function getStringArrayEnv(name: string, fallback: string[] = []) {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

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
  zhihu: {
    appKey: process.env.ZHIHU_APP_KEY || '',
    appSecret: process.env.ZHIHU_APP_SECRET || '',
    apiBaseUrl: process.env.ZHIHU_API_BASE_URL || DEFAULT_ZHIHU_API_BASE_URL,
    ringIds: getStringArrayEnv('ZHIHU_RING_IDS', [
      '2001009660925334090',
      '2015023739549529606',
    ]),
    publishMode:
      process.env.ZHIHU_PUBLISH_MODE === 'autonomous' ? 'autonomous' : 'controlled',
  },
  simulation: {
    tickIntervalMs: getNumberEnv('SIM_TICK_INTERVAL_MS', 20_000),
    minWorldAgentCount: getNumberEnv('MIN_WORLD_AGENT_COUNT', 10),
  },
  neo4j: {
    uri: process.env.NEO4J_URI || '',
    username: process.env.NEO4J_USERNAME || '',
    password: process.env.NEO4J_PASSWORD || '',
    database: process.env.NEO4J_DATABASE || '',
  },
}

export function hasSecondMeCredentials() {
  return Boolean(env.secondMe.clientId && env.secondMe.clientSecret)
}

export function hasZhihuCredentials() {
  return Boolean(env.zhihu.appKey && env.zhihu.appSecret)
}

export function hasNeo4jCredentials() {
  return Boolean(env.neo4j.uri && env.neo4j.username && env.neo4j.password)
}
