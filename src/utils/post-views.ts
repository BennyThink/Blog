import { DatabaseSync } from "node:sqlite";
import config from "virtual:emdash/config";

const flushInterval = 30_000;
let pending = new Map<string, number>();
let timer: NodeJS.Timeout | undefined;
let db: DatabaseSync | undefined;

export function recordPostView(postId: string) {
	pending.set(postId, (pending.get(postId) ?? 0) + 1);
	scheduleFlush();
}

function scheduleFlush() {
	if (timer || pending.size === 0) return;
	timer = setTimeout(flush, flushInterval).unref();
}

function flush() {
	timer = undefined;
	const batch = pending;
	pending = new Map();

	try {
		const url = config.database.config.url;
		db ??= new DatabaseSync(url.startsWith("file:") ? url.slice(5) : url);
		const update = db.prepare(`
			UPDATE ec_posts SET views = COALESCE(views, 0) + ?
			WHERE id = ? AND status = 'published' AND deleted_at IS NULL
		`);
		db.exec("BEGIN IMMEDIATE");
		try {
			for (const [id, increment] of batch) update.run(increment, id);
			db.exec("COMMIT");
		} catch (error) {
			if (db.isTransaction) db.exec("ROLLBACK");
			throw error;
		}
	} catch (error) {
		console.error("Failed to save post views", error);
		pending = batch;
		scheduleFlush();
	}
}
