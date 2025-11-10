import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  array,
  boolean,
  custom,
  Environment,
  EnvironmentError,
  type InferConfig,
  json,
  load,
  number,
  string,
} from './index';

describe('Field constructors', () => {
  it('string() coerces values to string', () => {
    const field = string();
    expect(field.coerce('hello')).toBe('hello');
  });

  it('number() coerces valid numbers', () => {
    const field = number();
    expect(field.coerce('42')).toBe(42);
    expect(field.coerce('3.14')).toBe(3.14);
  });

  it('number() throws on invalid numbers', () => {
    const field = number();
    expect(() => field.coerce('not a number')).toThrow('Not a valid number');
  });

  it('boolean() coerces true values', () => {
    const field = boolean();
    expect(field.coerce('true')).toBe(true);
    expect(field.coerce('TRUE')).toBe(true);
    expect(field.coerce('1')).toBe(true);
  });

  it('boolean() coerces false values', () => {
    const field = boolean();
    expect(field.coerce('false')).toBe(false);
    expect(field.coerce('FALSE')).toBe(false);
    expect(field.coerce('0')).toBe(false);
  });

  it('boolean() throws on invalid values', () => {
    const field = boolean();
    expect(() => field.coerce('yes')).toThrow('Not a valid boolean');
  });

  it('array() splits strings by separator', () => {
    const field = array(string());
    expect(field.coerce('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('array() handles empty strings', () => {
    const field = array(string());
    expect(field.coerce('')).toEqual([]);
  });

  it('array() uses custom separator', () => {
    const field = array(string(), { separator: ';' });
    expect(field.coerce('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  it('array() coerces items with type', () => {
    const field = array(number());
    expect(field.coerce('1,2,3')).toEqual([1, 2, 3]);
  });

  it('json() parses JSON strings', () => {
    const field = json<{ name: string; age: number }>();
    expect(field.coerce('{"name":"Alice","age":30}')).toEqual({
      name: 'Alice',
      age: 30,
    });
  });

  it('custom() allows custom coercion', () => {
    const field = custom(s => s.toUpperCase());
    expect(field.coerce('hello')).toBe('HELLO');
  });
});

describe('Field modifiers', () => {
  it('default() sets default value', () => {
    const field = string().default('default-value');
    expect(field.defaultValue).toBe('default-value');
  });

  it('optional() marks field as optional', () => {
    const field = string().optional();
    expect(field.isOptional).toBe(true);
  });

  it('fromEnv() overrides env var name', () => {
    const field = string().fromEnv('CUSTOM_NAME');
    expect(field.envName).toBe('CUSTOM_NAME');
  });
});

describe('load()', () => {
  it('loads required fields from env', () => {
    const schema = {
      DATABASE_URL: string(),
    };

    const config = load(schema, {
      env: { DATABASE_URL: 'postgres://localhost' },
    });

    expect(config.DATABASE_URL).toBe('postgres://localhost');
  });

  it('throws on missing required field', () => {
    const schema = {
      DATABASE_URL: string(),
    };

    expect(() => load(schema, { env: {} })).toThrow(
      "Config 'DATABASE_URL' is missing and has no default.",
    );
  });

  it('uses default values', () => {
    const schema = {
      PORT: number().default(3000),
      DEBUG: boolean().default(false),
    };

    const config = load(schema, { env: {} });

    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
  });

  it('handles optional fields', () => {
    const schema = {
      API_KEY: string().optional(),
    };

    const config = load(schema, { env: {} });

    expect(config.API_KEY).toBeUndefined();
  });

  it('applies envPrefix', () => {
    const schema = {
      PORT: number(),
    };

    const config = load(schema, {
      env: { APP_PORT: '8080' },
      envPrefix: 'APP_',
    });

    expect(config.PORT).toBe(8080);
  });

  it('uses fromEnv() for custom env var names', () => {
    const schema = {
      apiKey: string().fromEnv('SERVICE_API_KEY'),
    };

    const config = load(schema, {
      env: { SERVICE_API_KEY: 'secret-key' },
    });

    expect(config.apiKey).toBe('secret-key');
  });

  it('env vars take precedence over .env file', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'PORT=3000');

    try {
      const schema = {
        PORT: number(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { PORT: '8080' },
      });

      expect(config.PORT).toBe(8080);
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('loads from .env file when env var not set', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `DATABASE_URL=postgres://localhost
PORT=3000
DEBUG=true`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
        PORT: number(),
        DEBUG: boolean(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.DATABASE_URL).toBe('postgres://localhost');
      expect(config.PORT).toBe(3000);
      expect(config.DEBUG).toBe(true);
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('handles quoted values in .env file', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `NAME="John Doe"
MESSAGE='Hello World'`,
    );

    try {
      const schema = {
        NAME: string(),
        MESSAGE: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.NAME).toBe('John Doe');
      expect(config.MESSAGE).toBe('Hello World');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('ignores comments and empty lines in .env file', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `# Comment
PORT=3000

# Another comment
DEBUG=true`,
    );

    try {
      const schema = {
        PORT: number(),
        DEBUG: boolean(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.PORT).toBe(3000);
      expect(config.DEBUG).toBe(true);
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('throws descriptive error on coercion failure', () => {
    const schema = {
      PORT: number(),
    };

    expect(() =>
      load(schema, {
        env: { PORT: 'not-a-number' },
      }),
    ).toThrow("Config 'PORT' has value 'not-a-number'. Not a valid number");
  });

  it('infers correct types', () => {
    const schema = {
      DATABASE_URL: string(),
      PORT: number().default(3000),
      DEBUG: boolean().default(false),
      ALLOWED_ORIGINS: array(string()).default([]),
      API_KEY: string().optional(),
    };

    type Config = InferConfig<typeof schema>;

    const config: Config = load(schema, {
      env: { DATABASE_URL: 'postgres://localhost' },
    });

    expect(config.DATABASE_URL).toBe('postgres://localhost');
    expect(config.PORT).toBe(3000);
    expect(config.DEBUG).toBe(false);
    expect(config.ALLOWED_ORIGINS).toEqual([]);
    expect(config.API_KEY).toBeUndefined();
  });
});

describe('Environment', () => {
  let env: Environment;

  beforeEach(() => {
    env = new Environment({ TEST_VAR: 'test-value' });
  });

  it('tracks read values', () => {
    env.get('TEST_VAR');
    expect(() => env.set('TEST_VAR', 'new-value')).toThrow(EnvironmentError);
  });

  it('allows setting unread values', () => {
    env.set('NEW_VAR', 'new-value');
    expect(env.get('NEW_VAR')).toBe('new-value');
  });

  it('prevents deletion of read values', () => {
    env.get('TEST_VAR');
    expect(() => env.delete('TEST_VAR')).toThrow(EnvironmentError);
  });

  it('allows deletion of unread values', () => {
    env.delete('TEST_VAR');
    expect(env.get('TEST_VAR')).toBeUndefined();
  });

  it('has() checks for key existence', () => {
    expect(env.has('TEST_VAR')).toBe(true);
    expect(env.has('NONEXISTENT')).toBe(false);
  });
});
