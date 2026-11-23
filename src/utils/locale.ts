import { getI18nConfig } from "emdash";

/**
 * The default locale from the site's Astro `i18n` config, if it names a
 * language this runtime can format. Callers fall back to English when it's
 * undefined.
 */
export function getSiteLocale(): string | undefined {
	const locale = getI18nConfig()?.defaultLocale;
	if (!locale) return "zh-CN";
	try {
		return Intl.DateTimeFormat.supportedLocalesOf(locale)[0];
	} catch {
		// Malformed tags such as "pt_BR" throw instead of matching nothing.
		return undefined;
	}
}

/** Formats a date in the site's locale, or in US English without one. */
export function formatDate(date: Date, month: "long" | "short"): string {
	return date.toLocaleDateString(getSiteLocale() ?? "zh-CN", {
		year: "numeric",
		month,
		day: "numeric",
	});
}

const postTimestamp = new Intl.DateTimeFormat("sv-SE", {
	timeZone: "Asia/Shanghai",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
});

/** Format list metadata with the same relative units as the WordPress theme. */
export function formatPostAge(date: Date, now = Date.now()): string {
	const seconds = (now - date.getTime()) / 1000;
	const day = 86_400;
	if (seconds >= 360 * day) {
		return `${Math.round(seconds / (360 * day))} 年前 (${postTimestamp.format(date)})`;
	}

	const age = [
		{ threshold: 30 * day, unit: "个月", showDate: true },
		{ threshold: 7 * day, unit: "周", showDate: true },
		{ threshold: day, unit: "天", showDate: true },
		{ threshold: 3600, unit: "小时" },
		{ threshold: 60, unit: "分钟" },
		{ threshold: 1, unit: "秒" },
	].find(({ threshold }) => seconds >= threshold);
	if (!age) return "刚刚";

	const timestamp = age.showDate ? ` (${postTimestamp.format(date).slice(5)})` : "";
	return `${Math.round(seconds / age.threshold)} ${age.unit}前${timestamp}`;
}
