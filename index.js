#!/usr/bin/env node
// Minimal stdio MCP server exposing two timezone tools. No dependencies.

const TOOLS = [
  {
    name: 'current_time',
    title: 'Current time',
    description: 'Return the current date and time in an IANA timezone.',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone, e.g. Europe/Paris. Defaults to UTC.' },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'convert_time',
    title: 'Convert time',
    description: 'Convert an ISO-8601 timestamp into another IANA timezone.',
    inputSchema: {
      type: 'object',
      properties: {
        timestamp: { type: 'string', description: 'ISO-8601 timestamp, e.g. 2026-01-31T09:00:00Z.' },
        timezone: { type: 'string', description: 'Target IANA timezone, e.g. Asia/Tokyo.' },
      },
      required: ['timestamp', 'timezone'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
]

function format(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date)
}

function callTool(name, args) {
  const timeZone = args.timezone || 'UTC'
  if (name === 'current_time') return format(new Date(), timeZone)
  if (name === 'convert_time') {
    const date = new Date(args.timestamp)
    if (Number.isNaN(date.getTime())) throw new Error(`Not a valid timestamp: ${args.timestamp}`)
    return format(date, timeZone)
  }
  throw new Error(`Unknown tool: ${name}`)
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let index
  while ((index = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, index).trim()
    buffer = buffer.slice(index + 1)
    if (line) handle(line)
  }
})

function handle(line) {
  let request
  try {
    request = JSON.parse(line)
  } catch {
    return
  }
  const { id, method, params } = request
  if (id === undefined) return // notification

  try {
    if (method === 'initialize') {
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2025-06-18',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'world-clock', version: '1.0.0' },
        },
      })
    }
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } })
    if (method === 'tools/call') {
      const text = callTool(params.name, params.arguments || {})
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } })
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
  } catch (error) {
    send({ jsonrpc: '2.0', id, error: { code: -32603, message: error.message } })
  }
}
