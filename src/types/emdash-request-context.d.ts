import "emdash";

declare module "emdash" {
	interface EmDashRequestContext {
		/** Client IP captured by site middleware for per-request integrations. */
		commentClientIp?: string | null;
	}
}
