'use strict'

const path = require('path')

/** Electron 打包时 shared 在 resources/shared，依赖在 app.asar/node_modules */
function requireSupabaseJs() {
  try {
    return require('@supabase/supabase-js')
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err
  }
  const searchPaths = []
  if (process.resourcesPath) {
    searchPaths.push(path.join(process.resourcesPath, 'app.asar', 'node_modules'))
  }
  searchPaths.push(
    path.join(__dirname, '..', '..', 'gamebet_backend', 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules'),
    path.join(__dirname, '..', 'node_modules'),
  )
  return require(require.resolve('@supabase/supabase-js', { paths: searchPaths }))
}

// 由入口进程加载 .env（gamebet_matcher/rebuild、gamebet_backend/host/web 等）
const { createClient } = requireSupabaseJs()

const sbUrl  = process.env.SUPABASE_URL
const sbKey  = process.env.SUPABASE_KEY
const sbSvc  = process.env.SUPABASE_SERVICE_KEY

// 主客户端（anon key）— 用户鉴权 + 数据读写
let supabase      = null

// 管理客户端（service_role key）— 仅用于 auth.admin API
let supabaseAdmin = null

if (sbUrl && (sbKey || sbSvc)) {
  supabase = createClient(sbUrl, sbKey || sbSvc, {
    auth: {
      persistSession:   false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  if (sbSvc) {
    supabaseAdmin = createClient(sbUrl, sbSvc, {
      auth: {
        persistSession:   false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }

  console.log('[db] Supabase 已连接')
} else {
  console.log('[db] 未配置 Supabase，仅使用内存存储')
}

module.exports = { supabase, supabaseAdmin }
