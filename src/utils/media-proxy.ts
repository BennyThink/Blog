import type { ImageValue } from "emdash";

export function proxyMediaUrl(url: string | undefined, configuredProxyUrl = ""): string | undefined {
	const proxyUrl = configuredProxyUrl.trim().replace(/\/+$/, "");
	if (!proxyUrl || !url) return url;
	try {
		const parsed = new URL(url, "http://localhost");
		if (!parsed.pathname.startsWith("/_emdash/api/media/file/")) return url;
		return `${proxyUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return url;
	}
}

/** Give EmDash's Image component the proxy URL while retaining image metadata. */
export function proxyImage<T extends ImageValue | undefined | null>(image: T, configuredProxyUrl = ""): T {
	const proxyUrl = configuredProxyUrl.trim();
	if (!image || !proxyUrl) return image;
	const path = image.meta?.storageKey
		? `/_emdash/api/media/file/${String(image.meta.storageKey).split("/").map(encodeURIComponent).join("/")}`
		: image.src || (image.id ? `/_emdash/api/media/file/${encodeURIComponent(image.id)}` : undefined);
	const src = proxyMediaUrl(path, proxyUrl);
	return (src ? { ...image, src } : image) as T;
}
