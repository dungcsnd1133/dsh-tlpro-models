/**
 * Tests for the host half.
 *
 * These exist to back a claim: that this package does something at runtime
 * rather than shipping an empty `apply`. Each test drives the module with a
 * stub context and asserts on what it reported.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

/** A ctx that records every logging call. */
function stubCtx({ credentials = {}, env = {}, withEffect = true } = {}) {
	const lines = []
	const ctx = {
		logger: {
			info: (fmt, ...args) => lines.push(['info', fmt, args]),
			warn: (fmt, ...args) => lines.push(['warn', fmt, args]),
		},
		get: (name) => (name === 'credentials' ? { get: (key) => credentials[key] } : undefined),
	}
	if (withEffect) ctx.effect = (fn) => fn()
	return { ctx, lines }
}

/** Restore env vars around a test. */
function withEnv(vars, fn) {
	const saved = {}
	for (const [k, v] of Object.entries(vars)) {
		saved[k] = process.env[k]
		process.env[k] = v
	}
	try {
		return fn()
	} finally {
		for (const [k, v] of Object.entries(saved)) {
			if (v === undefined) delete process.env[k]
			else process.env[k] = v
		}
	}
}

test('báo lỗi rõ khi thiếu key, nêu tên biến và model sẽ hỏng', () => {
	const { ctx, lines } = stubCtx({ credentials: {}, env: {} })
	const saved = { ...process.env }
	delete process.env.TLPRO_API_KEY
	delete process.env.ZAI_API_KEY
	try {
		apply(ctx)
	} finally {
		Object.assign(process.env, saved)
	}
	const warns = lines.filter(([level]) => level === 'warn')
	assert.equal(warns.length, 2, 'mỗi route thiếu key phải có đúng một cảnh báo')
	const text = warns.map(([, , args]) => args.map(String).join(' ')).join(' ')
	assert.match(text, /TLPRO_API_KEY/)
	assert.match(text, /ZAI_API_KEY/)
	// Cảnh báo phải nói được model nào hỏng, không chỉ "thiếu key".
	assert.match(text, /glm-5\.3/)
})

test('im lặng khi đủ key, chỉ báo inventory', () => {
	// Key đi qua credentials service chứ không phải process.env: test trước đó
	// ghi đè process.env rồi khôi phục, và thứ tự chạy không đảm bảo, nên một
	// test dựa vào env toàn cục sẽ hỏng theo cách khó hiểu.
	const { ctx, lines } = stubCtx({ credentials: { TLPRO_API_KEY: 'x', ZAI_API_KEY: 'y' } })
	const saved = { ...process.env }
	delete process.env.TLPRO_API_KEY
	delete process.env.ZAI_API_KEY
	try {
		apply(ctx)
	} finally {
		Object.assign(process.env, saved)
	}
	assert.equal(lines.filter(([l]) => l === 'warn').length, 0)
	const info = lines.filter(([l]) => l === 'info')
	assert.equal(info.length, 1)
	assert.match(String(info[0][1]), /routes ready/)
})

test('đọc key qua credentials service, không chỉ process.env', () => {
	const { ctx, lines } = stubCtx({
		credentials: { TLPRO_API_KEY: 'from-service', ZAI_API_KEY: 'from-service' },
		env: {},
	})
	const saved = { ...process.env }
	delete process.env.TLPRO_API_KEY
	delete process.env.ZAI_API_KEY
	try {
		apply(ctx)
	} finally {
		Object.assign(process.env, saved)
	}
	assert.equal(lines.filter(([l]) => l === 'warn').length, 0, 'service có key thì không được cảnh báo')
})

test('không nổ khi profile không mount credentials service', () => {
	const lines = []
	const ctx = { logger: { info: (f, ...a) => lines.push(['info', f, a]), warn: (f, ...a) => lines.push(['warn', f, a]) }, get: () => undefined }
	const saved = { ...process.env }
	delete process.env.TLPRO_API_KEY
	delete process.env.ZAI_API_KEY
	try {
		assert.doesNotThrow(() => apply(ctx))
	} finally {
		Object.assign(process.env, saved)
	}
	assert.ok(lines.length > 0, 'vẫn phải báo cáo')
})

test('không nổ khi ctx không có effect hay on (mount tối giản)', () => {
	const ctx = { logger: { info: () => {}, warn: () => {} }, get: () => undefined }
	assert.doesNotThrow(() => apply(ctx))
})
