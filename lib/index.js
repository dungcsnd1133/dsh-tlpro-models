/**
 * Host half of dsh-tlpro-models.
 *
 * The provider *declarations* live in `cordis.patch.yml` — that is the
 * composition mechanism DSH documents for a bundle, and it is where the routes,
 * context windows and reasoning ladders belong. This module is not a shell
 * around it: it does two things at runtime that the patch format cannot.
 *
 * 1. **It verifies each declared route can actually authenticate.** A patch can
 *    name `apiKeyEnv: ZAI_API_KEY`, but nothing in the patch format can tell the
 *    user that the variable is unset. The observable symptom is a model that
 *    appears in the picker and fails on the first send — which reads as "the
 *    plugin is broken" rather than "a key is missing". Checking at boot moves
 *    that from mid-conversation failure to a startup warning that names the fix.
 *
 * 2. **It reports the route inventory once**, so `dsh -v`-style inspection and
 *    the boot log both show which providers this bundle contributed.
 *
 * What it deliberately does NOT do: touch, wrap or re-implement `llm-pi-ai`.
 * The routes are ordinary configuration; re-registering them from code would
 * duplicate what the patch already did and fight the host for ownership.
 */

export const name = 'dsh-tlpro-models'

/**
 * No required services.
 *
 * This is an empty array rather than `{ required: [], optional: ['credentials'] }`
 * on purpose: DSH treats the object form as a declaration of services it must
 * WAIT for, and an optional entry still parks the plugin in
 * `pending (waiting for services)` on a profile that mounts no credentials
 * service — verified by booting a headless profile, where the plugin never ran.
 * The credentials service is therefore looked up at call time instead, which is
 * the same thing dsh-mnemon does for the same reason.
 */
export const inject = []

/**
 * The routes this bundle contributes, mirroring `cordis.patch.yml`.
 *
 * Kept in step with the patch by hand rather than parsed out of it: parsing YAML
 * at runtime would add a dependency for no benefit, and a mismatch here only
 * downgrades a startup warning, never the routes themselves (the patch remains
 * the single source of truth for what DSH actually serves).
 */
const ROUTES = [
	{
		id: 'tlpro',
		label: 'TLPro',
		keyEnv: 'TLPRO_API_KEY',
		models: ['deepseek-v4.1-flash', 'glm-5.3', 'glm-5.3-flash'],
	},
	{
		id: 'zai',
		label: 'Z.ai (GLM)',
		keyEnv: 'ZAI_API_KEY',
		models: ['glm-5.3', 'glm-5.3-flash'],
	},
]

/**
 * Read one credential through the host service, falling back to the environment.
 *
 * The environment fallback matters: DSH resolves `apiKeyEnv` through the same
 * two places, so a plugin that only asked the service would warn about a key
 * that is present and working.
 * @param {any} ctx - host context.
 * @param {string} name - variable name.
 * @returns {string} the value, or '' when unset.
 */
function readCredential(ctx, name) {
	let fromService = ''
	try {
		// `ctx.get` is the guarded accessor; a profile without the service mounted
		// returns undefined rather than throwing, which is why both are tried.
		const service = typeof ctx.get === 'function' ? ctx.get('credentials') : ctx.credentials
		if (service !== undefined && service !== null) {
			const value = typeof service.get === 'function' ? service.get(name) : undefined
			if (typeof value === 'string') fromService = value
		}
	} catch {
		// An absent or misbehaving service must not stop the plugin loading.
	}
	if (fromService !== '') return fromService
	const fromEnv = process.env[name]
	return typeof fromEnv === 'string' ? fromEnv : ''
}

/**
 * Verify every declared route and report the inventory.
 * @param {any} ctx - host context.
 */
function reportRoutes(ctx) {
	const log = ctx.logger
	const missing = []
	for (const route of ROUTES) {
		const present = readCredential(ctx, route.keyEnv) !== ''
		if (!present) missing.push(route)
	}

	if (missing.length === 0) {
		log?.info?.(
			'dsh-tlpro-models: %d routes ready (%s)',
			ROUTES.length,
			ROUTES.map((route) => `${route.id}: ${route.models.length} models`).join(', '),
		)
		return
	}

	// One warning listing every gap, not one per route: three separate warnings
	// for one misconfiguration trains people to ignore warnings.
	for (const route of missing) {
		log?.warn?.(
			'dsh-tlpro-models: %s is declared but %s is not set, so its %d model(s) will fail on first send. Set %s (or paste it on the Models page) to enable: %s',
			route.label,
			route.keyEnv,
			route.models.length,
			route.keyEnv,
			route.models.join(', '),
		)
	}
}

/**
 * Plugin entry.
 * @param {any} ctx - host context.
 */
export function apply(ctx) {
	reportRoutes(ctx)

	// Re-check when credentials change: the Models page writes them while the
	// process is running, and a warning that was true at boot should not stay
	// on screen after the user fixes it. `ctx.on` is absent on some mounts, so
	// the subscription is optional rather than assumed.
	if (typeof ctx.on === 'function') {
		const off = ctx.on('credentials/changed', () => reportRoutes(ctx))
		// Disposers are registered only when the host offers `ctx.effect`; calling
		// it unconditionally would throw on a mount that does not. The earlier
		// version of this guard tested `ctx.on` for being an object, which it never
		// is — the subscription was created and then silently never disposed.
		if (typeof off === 'function' && typeof ctx.effect === 'function') {
			ctx.effect(() => off)
		}
	}
}
