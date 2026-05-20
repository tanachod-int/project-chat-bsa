import { Pool, PoolConfig } from 'pg'

interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  ssl: boolean | { rejectUnauthorized: boolean }
}

// ===============================================
// Configuration Setup
// ===============================================
function getDatabaseConfig(): DatabaseConfig {
  const requiredEnvVars = ['PG_HOST', 'PG_PORT', 'PG_USER', 'PG_PASSWORD', 'PG_DATABASE']
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName])

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
  }

  return {
    host: process.env.PG_HOST!,
    port: Number(process.env.PG_PORT!),
    user: process.env.PG_USER!,
    password: process.env.PG_PASSWORD!,
    database: process.env.PG_DATABASE!,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  }
}

// ===============================================
// Database Pool
// ===============================================
let pool: Pool | null = null

export function getDatabase(): Pool {
  if (!pool) {
    const config: PoolConfig = {
      ...getDatabaseConfig(),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    }

    pool = new Pool(config)

    pool.on('error', (err) => {
      console.error('❌ PostgreSQL pool error', err)
    })

    console.log('✅ PostgreSQL pool initialized')
  }

  return pool
}

// ===============================================
// Connection Testing Utility
// ===============================================
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const pool = getDatabase()
    const result = await pool.query('SELECT 1')
    console.log('✅ PostgreSQL: Connection test successful', result.rows)
    return true
  } catch (error) {
    console.error('❌ PostgreSQL: Connection test failed:', error)
    return false
  }
}

// ===============================================
// Cleanup Utilities
// ===============================================
export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    console.log('⚠️ PostgreSQL pool exists. You can optionally call pool.end() when server shuts down.')
  }
}

// ===============================================
// Health Check
// ===============================================
export async function getDatabaseHealth() {
  try {
    const pool = getDatabase()
    const result = await pool.query('SELECT version()')
    return {
      status: 'healthy',
      dbVersion: result.rows[0].version,
      totalConnections: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingConnections: pool.waitingCount,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }
  }
}

export default getDatabase
