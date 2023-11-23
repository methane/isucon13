import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { createPool } from 'mysql2/promise'
import { sessionMiddleware, CookieStore } from 'hono-sessions'
import { ApplicationDeps, Deps, HonoEnvironment } from './types/application'
import {
  getIconHandler,
  getMeHandler,
  getUserHandler,
  loginHandler,
  postIconHandler,
  registerHandler,
} from './handlers/user-handler'
import { getStreamerThemeHandler, getTagHandler } from './handlers/top-handler'
import {
  enterLivestreamHandler,
  exitLivestreamHandler,
  getLivecommentReportsHandler,
  getLivestreamHandler,
  getMyLivestreamsHandler,
  getUserLivestreamsHandler,
  reserveLivestreamHandler,
  searchLivestreamsHandler,
} from './handlers/livestream-handler'
import {
  getLivecommentsHandler,
  getNgwords,
  moderateHandler,
  postLivecommentHandler,
  reportLivecommentHandler,
} from './handlers/livecomment-handler'
import {
  getReactionsHandler,
  postReactionHandler,
} from './handlers/reaction-handler'
import {
  getLivestreamStatisticsHandler,
  getUserStatisticsHandler,
} from './handlers/stats-handler'
import { GetPaymentResult } from './handlers/payment-handler'

export const createApp = (deps: Deps) => {
  const pool = createPool({
    user: process.env['ISUCON13_MYSQL_DIALCONFIG_USER'] ?? 'isucon',
    password: process.env['ISUCON13_MYSQL_DIALCONFIG_PASSWORD'] ?? 'isucon',
    database: process.env['ISUCON13_MYSQL_DIALCONFIG_DATABASE'] ?? 'isupipe',
    host: process.env['ISUCON13_MYSQL_DIALCONFIG_ADDRESS'] ?? '127.0.0.1',
    port: Number(process.env['ISUCON13_MYSQL_DIALCONFIG_PORT'] ?? '3306'),
    connectionLimit: 10,
  })

  if (!process.env['ISUCON13_POWERDNS_SUBDOMAIN_ADDRESS']) {
    throw new Error(
      'envionment variable ISUCON13_POWERDNS_SUBDOMAIN_ADDRESS is not set',
    )
  }
  const powerDNSSubdomainAddress =
    process.env['ISUCON13_POWERDNS_SUBDOMAIN_ADDRESS']

  const store = new CookieStore()

  const applicationDeps = {
    ...deps,
    powerDNSSubdomainAddress,
  } satisfies ApplicationDeps

  const app = new Hono<HonoEnvironment>()
  app.use('*', logger())
  app.use(
    '*',
    sessionMiddleware({
      store,
      encryptionKey: '24553845-c33d-4a87-b0c3-f7a0e17fd82f',
      cookieOptions: {
        path: '/',
        domain: 'u.isucon.dev',
        maxAge: 60_000 /* 10 seconds */, // FIXME: 600
      },
    }),
  )
  app.use('*', async (c, next) => {
    c.set('pool', pool)
    c.set('deps', applicationDeps)
    await next()
  })
  app.use('*', async (c, next) => {
    await next()
    if (c.res.status >= 400) {
      console.error(c.res.status, await c.res.clone().text())
    }
  })

  // 初期化
  app.post('/api/initialize', async (c) => {
    try {
      await deps.exec(['../sql/init.sh'])
      return c.json({ advertise_level: 10, advertise_name: 'node' })
    } catch (error) {
      console.log('init.sh failed with')
      console.log(error)
      return c.text('failed to initialize', 500)
    }
  })

  // top
  app.get('/api/tag', getTagHandler)
  app.get('/api/user/:username/theme', ...getStreamerThemeHandler)

  // livestream
  // reserve livestream
  app.post('/api/livestream/reservation', ...reserveLivestreamHandler)
  // list livestream
  app.get('/api/livestream/search', searchLivestreamsHandler)
  app.get('/api/livestream', ...getMyLivestreamsHandler)
  app.get('/api/user/:username/livestream', ...getUserLivestreamsHandler)
  // get livestream
  app.get('/api/livestream/:livestream_id', ...getLivestreamHandler)
  // get polling livecomment timeline
  app.get(
    '/api/livestream/:livestream_id/livecomment',
    ...getLivecommentsHandler,
  )
  // ライブコメント投稿
  app.post(
    '/api/livestream/:livestream_id/livecomment',
    ...postLivecommentHandler,
  )
  app.post('/api/livestream/:livestream_id/reaction', ...postReactionHandler)
  app.get('/api/livestream/:livestream_id/reaction', ...getReactionsHandler)

  // (配信者向け)ライブコメントの報告一覧取得API
  app.get(
    '/api/livestream/:livestream_id/report',
    ...getLivecommentReportsHandler,
  )
  app.get('/api/livestream/:livestream_id/ngwords', ...getNgwords)
  // ライブコメント報告
  app.post(
    '/api/livestream/:livestream_id/livecomment/:livecomment_id/report',
    ...reportLivecommentHandler,
  )
  // 配信者によるモデレーション (NGワード登録)
  app.post('/api/livestream/:livestream_id/moderate', ...moderateHandler)

  // livestream_viewersにINSERTするため必要
  // ユーザ視聴開始 (viewer)
  app.post('/api/livestream/:livestream_id/enter', ...enterLivestreamHandler)
  // ユーザ視聴終了 (viewer)
  app.delete('/api/livestream/:livestream_id/exit', ...exitLivestreamHandler)

  // user
  app.post('/api/register', registerHandler)
  app.post('/api/login', loginHandler)
  app.get('/api/user/me', ...getMeHandler)
  // フロントエンドで、配信予約のコラボレーターを指定する際に必要
  app.get('/api/user/:username', ...getUserHandler)
  app.get('/api/user/:username/statistics', ...getUserStatisticsHandler)
  app.get('/api/user/:username/icon', ...getIconHandler)
  app.post('/api/icon', ...postIconHandler)

  // stats
  // ライブ配信統計情報
  app.get(
    '/api/livestream/:livestream_id/statistics',
    ...getLivestreamStatisticsHandler,
  )

  // // 課金情報
  app.get('/api/payment', GetPaymentResult)

  return app
}
