/** Public WordPress-compatible post permalink. Slugs remain extension-free. */
export function postPath(slug: string): string {
	return `/${encodeURIComponent(slug)}.html`;
}
