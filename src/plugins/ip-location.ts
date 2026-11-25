import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { IPv4, IPv6, newWithFileOnly, type Searcher } from "ip2region.js";

const databaseDirectory = fileURLToPath(new URL("../../data/ip2region/", import.meta.url));
const searchers = new Map<number, Searcher>();

/** Look up an IP using the bundled local ip2region xdb files. */
export async function lookupIpLocation(ip: string | null | undefined): Promise<string> {
	if (!ip) return "未知";
	try {
		const version = ip.includes(":") ? IPv6 : IPv4;
		const database = resolve(databaseDirectory, version === IPv6 ? "ip2region_v6.xdb" : "ip2region_v4.xdb");
		if (!existsSync(database)) return "未知";
		let searcher = searchers.get(version.id);
		if (!searcher) {
			searcher = newWithFileOnly(version, database);
			searchers.set(version.id, searcher);
		}
		const region = (await searcher.search(ip)).split("|").filter(Boolean);
		// Format: country|province|city|ISP|country-code.
		return region.slice(0, 4).join(" ") || "未知";
	} catch {
		return "未知";
	}
}
