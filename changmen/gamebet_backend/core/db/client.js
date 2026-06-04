'use strict'

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

let supabase = null
const sbUrl = process.env.SUPABASE_URL
const sbKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY

if (sbUrl && sbKey) {
  supabase = createClient(sbUrl, sbKey, { auth: { persistSession: false } })
  console.log('[db] Supabase 已连接')
} else {
  console.log('[db] 未配置 Supabase，仅使用内存存储')
}

module.exports = { supabase }
