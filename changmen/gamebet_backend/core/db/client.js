'use strict'

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const sbUrl  = process.env.SUPABASE_URL
const sbKey  = process.env.SUPABASE_KEY
const sbSvc  = process.env.SUPABASE_SERVICE_KEY

// 主客户端（anon key）— 用于用户鉴权 + 所有数据读写（authenticated 策略）
let supabase      = null

// 管理客户端（service_role key）— 仅用于 auth.admin API（signOut / writeUserMetadata）
// 非必须：不配置 SUPABASE_SERVICE_KEY 时这两个功能降级跳过，其余功能不受影响
let supabaseAdmin = null

if (sbUrl && (sbKey || sbSvc)) {
  supabase = createClient(sbUrl, sbKey || sbSvc, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (sbSvc) {
    supabaseAdmin = createClient(sbUrl, sbSvc, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } else {
    // 没有 service key，降级复用 anon 客户端（写入可能受 RLS 限制）
    supabaseAdmin = supabase
    console.warn('[db] 未配置 SUPABASE_SERVICE_KEY，数据写入使用 anon key，可能受 RLS 限制')
  }

  console.log('[db] Supabase 已连接')
} else {
  console.log('[db] 未配置 Supabase，仅使用内存存储')
}

module.exports = { supabase, supabaseAdmin }
