import { load, string, number, boolean, array, json, type InferConfig } from "./src/index";

const schema = {
	DATABASE_URL: string(),
	PORT: number().default(3000),
	DEBUG: boolean().default(false),
	ALLOWED_ORIGINS: array(string(), { separator: "," }).default([]),
	SETTINGS: json<{ featureFlags: string[] }>().optional(),
	API_KEY: string().fromEnv("SERVICE_API_KEY").optional(),
} as const;

export const config = load(schema, {
	envFile: ".env",
	envPrefix: "APP_",
});

export type AppConfig = InferConfig<typeof schema>;
