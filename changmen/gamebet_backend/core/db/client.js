'use strict'

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

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
