'use strict'

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const sbUrl  = process.env.SUPABASE_URL
const sbKey  = process.env.SUPABASE_KEY
const sbSvc  = process.env.SUPABASE_SERVICE_KEY

// 主客户端（anon key）— 用户鉴权 + 数据读写
// autoRefreshToken: true 保证 JWT 到期前自动续期，session 不会失效
let supabase      = null

// 管理客户端（service_role key）— 仅用于 auth.admin API（signOut / writeUserMetadata）
// 非必须：不配置 SUPABASE_SERVICE_KEY 时这两个功能降级跳过
let supabaseAdmin = null

if (sbUrl && (sbKey || sbSvc)) {
  supabase = createClient(sbUrl, sbKey || sbSvc, {
    auth: { persistSession: false, autoRefreshToken: true },
  })

  if (sbSvc) {
    supabaseAdmin = createClient(sbUrl, sbSvc, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  console.log('[db] Supabase 已连接')
} else {
  console.log('[db] 未配置 Supabase，仅使用内存存储')
}

module.exports = { supabase, supabaseAdmin }
