import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  array,
  boolean,
  custom,
  derived,
  Environment,
  EnvironmentError,
  ephemeral,
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

describe('Variable interpolation', () => {
  it('expands $VAR syntax', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=localhost
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: true,
      });

      expect(config.DATABASE_URL).toBe('postgresql://localhost/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('expands ${VAR} syntax', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=localhost
PGPORT=5432
DATABASE_URL=postgresql://\${PGHOST}:\${PGPORT}/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: true,
      });

      expect(config.DATABASE_URL).toBe('postgresql://localhost:5432/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('expands with env-first precedence by default', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=file-host
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { PGHOST: 'env-host' },
        interpolate: true,
      });

      expect(config.DATABASE_URL).toBe('postgresql://env-host/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('supports file-first lookup', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=file-host
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { PGHOST: 'env-host' },
        interpolate: { lookup: 'file-first' },
      });

      expect(config.DATABASE_URL).toBe('postgresql://file-host/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('supports file-only lookup', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=file-host
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { PGHOST: 'env-host' },
        interpolate: { lookup: 'file-only' },
      });

      expect(config.DATABASE_URL).toBe('postgresql://file-host/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('supports env-only lookup', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'DATABASE_URL=postgresql://$PGHOST/mydb');

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { PGHOST: 'env-host' },
        interpolate: { lookup: 'env-only' },
      });

      expect(config.DATABASE_URL).toBe('postgresql://env-host/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('escapes \\$ for literal dollar signs', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'PRICE=\\$100');

    try {
      const schema = {
        PRICE: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: true,
      });

      expect(config.PRICE).toBe('$100');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('throws on missing reference by default', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'DATABASE_URL=postgresql://$MISSING/mydb');

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      expect(() =>
        load(schema, {
          envFile: tmpFile,
          env: {},
          interpolate: true,
        }),
      ).toThrow(".env reference 'MISSING' is not defined in env or file");
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it("leaves missing reference with 'leave' policy", () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'DATABASE_URL=postgresql://$MISSING/mydb');

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: { missing: 'leave' },
      });

      expect(config.DATABASE_URL).toBe('postgresql://$MISSING/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it("replaces missing reference with empty string with 'empty' policy", () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'DATABASE_URL=postgresql://$MISSING/mydb');

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: { missing: 'empty' },
      });

      expect(config.DATABASE_URL).toBe('postgresql:///mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('detects circular references', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `A=$B
B=$A`,
    );

    try {
      const schema = {
        A: string(),
      };

      expect(() =>
        load(schema, {
          envFile: tmpFile,
          env: {},
          interpolate: true,
        }),
      ).toThrow('Circular reference detected in .env: A -> B -> A');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('handles complex circular reference chains', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `A=$B
B=$C
C=$A`,
    );

    try {
      const schema = {
        A: string(),
      };

      expect(() =>
        load(schema, {
          envFile: tmpFile,
          env: {},
          interpolate: true,
        }),
      ).toThrow('Circular reference detected in .env: A -> B -> C -> A');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('allows references to environment variables from file', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'CUSTOM_PATH=/usr/local/bin:$ORIGINAL_PATH');

    try {
      const schema = {
        CUSTOM_PATH: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: { ORIGINAL_PATH: '/usr/bin' },
        interpolate: true,
      });

      expect(config.CUSTOM_PATH).toBe('/usr/local/bin:/usr/bin');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('works with multiple interpolations in one value', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `HOST=localhost
PORT=5432
USER=admin
DATABASE_URL=postgresql://$USER@$HOST:$PORT/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: true,
      });

      expect(config.DATABASE_URL).toBe('postgresql://admin@localhost:5432/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('does not interpolate when disabled', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=localhost
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: false,
      });

      expect(config.DATABASE_URL).toBe('postgresql://$PGHOST/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('defaults to no interpolation when option not provided', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PGHOST=localhost
DATABASE_URL=postgresql://$PGHOST/mydb`,
    );

    try {
      const schema = {
        DATABASE_URL: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.DATABASE_URL).toBe('postgresql://$PGHOST/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });
});

describe('Automatic case conversion', () => {
  it('converts camelCase to SCREAMING_SNAKE_CASE', () => {
    const schema = {
      databaseUrl: string(),
    };

    const config = load(schema, {
      env: { DATABASE_URL: 'postgres://localhost' },
    });

    expect(config.databaseUrl).toBe('postgres://localhost');
  });

  it('handles multiple camelCase words', () => {
    const schema = {
      myApiKeyValue: string(),
    };

    const config = load(schema, {
      env: { MY_API_KEY_VALUE: 'secret' },
    });

    expect(config.myApiKeyValue).toBe('secret');
  });

  it('works with .env files', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(tmpFile, 'DATABASE_URL=postgres://localhost');

    try {
      const schema = {
        databaseUrl: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.databaseUrl).toBe('postgres://localhost');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('works with envPrefix', () => {
    const schema = {
      databaseUrl: string(),
      apiKey: string(),
    };

    const config = load(schema, {
      env: {
        APP_DATABASE_URL: 'postgres://localhost',
        APP_API_KEY: 'secret',
      },
      envPrefix: 'APP_',
    });

    expect(config.databaseUrl).toBe('postgres://localhost');
    expect(config.apiKey).toBe('secret');
  });

  it('fromEnv() takes precedence over automatic conversion', () => {
    const schema = {
      databaseUrl: string().fromEnv('MY_CUSTOM_DB_URL'),
    };

    const config = load(schema, {
      env: {
        DATABASE_URL: 'wrong',
        MY_CUSTOM_DB_URL: 'correct',
      },
    });

    expect(config.databaseUrl).toBe('correct');
  });

  it('handles already SCREAMING_SNAKE_CASE keys', () => {
    const schema = {
      DATABASE_URL: string(),
    };

    const config = load(schema, {
      env: { DATABASE_URL: 'postgres://localhost' },
    });

    expect(config.DATABASE_URL).toBe('postgres://localhost');
  });

  it('handles single word lowercase keys', () => {
    const schema = {
      port: number(),
    };

    const config = load(schema, {
      env: { PORT: '3000' },
    });

    expect(config.port).toBe(3000);
  });

  it('handles PascalCase', () => {
    const schema = {
      DatabaseUrl: string(),
    };

    const config = load(schema, {
      env: { DATABASE_URL: 'postgres://localhost' },
    });

    expect(config.DatabaseUrl).toBe('postgres://localhost');
  });

  it('works with type coercion', () => {
    const schema = {
      databasePort: number(),
      debugMode: boolean(),
      allowedHosts: array(string()).default([]),
    };

    const config = load(schema, {
      env: {
        DATABASE_PORT: '5432',
        DEBUG_MODE: 'true',
        ALLOWED_HOSTS: 'host1,host2,host3',
      },
    });

    expect(config.databasePort).toBe(5432);
    expect(config.debugMode).toBe(true);
    expect(config.allowedHosts).toEqual(['host1', 'host2', 'host3']);
  });

  it('works with variable interpolation', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PG_HOST=localhost
PG_PORT=5432
DATABASE_URL=postgresql://$PG_HOST:$PG_PORT/mydb`,
    );

    try {
      const schema = {
        databaseUrl: string(),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
        interpolate: true,
      });

      expect(config.databaseUrl).toBe('postgresql://localhost:5432/mydb');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });
});

describe('Ephemeral and Derived fields', () => {
  it('ephemeral fields are not included in final config', () => {
    const schema = {
      temp: ephemeral(string()),
      actual: string(),
    };

    const config = load(schema, {
      env: {
        TEMP: 'not-in-config',
        ACTUAL: 'in-config',
      },
    });

    expect(config).toEqual({ actual: 'in-config' });
    expect('temp' in config).toBe(false);
  });

  it('derived fields can access regular fields', () => {
    const schema = {
      host: string(),
      port: number(),
      url: derived(cfg => `http://${cfg.host}:${cfg.port}`),
    };

    const config = load(schema, {
      env: {
        HOST: 'localhost',
        PORT: '3000',
      },
    });

    expect(config.url).toBe('http://localhost:3000');
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(3000);
  });

  it('derived fields can access ephemeral fields', () => {
    const schema = {
      pgHost: ephemeral(string()),
      pgPort: ephemeral(number()),
      pgUser: ephemeral(string()),
      pgPassword: ephemeral(string()),
      databaseUrl: derived(
        cfg => `postgresql://${cfg.pgUser}:${cfg.pgPassword}@${cfg.pgHost}:${cfg.pgPort}/mydb`,
      ),
    };

    const config = load(schema, {
      env: {
        PG_HOST: 'localhost',
        PG_PORT: '5432',
        PG_USER: 'admin',
        PG_PASSWORD: 'secret',
      },
    });

    expect(config.databaseUrl).toBe('postgresql://admin:secret@localhost:5432/mydb');
    expect('pgHost' in config).toBe(false);
    expect('pgPort' in config).toBe(false);
    expect('pgUser' in config).toBe(false);
    expect('pgPassword' in config).toBe(false);
  });

  it('ephemeral fields support defaults', () => {
    const schema = {
      tempPort: ephemeral(number().default(5432)),
      url: derived(cfg => `http://localhost:${cfg.tempPort}`),
    };

    const config = load(schema, { env: {} });

    expect(config.url).toBe('http://localhost:5432');
  });

  it('ephemeral fields support optional', () => {
    const schema = {
      tempValue: ephemeral(string().optional()),
      result: derived(cfg => cfg.tempValue ?? 'default'),
    };

    const config = load(schema, { env: {} });

    expect(config.result).toBe('default');
  });

  it('ephemeral fields support fromEnv', () => {
    const schema = {
      tempHost: ephemeral(string().fromEnv('CUSTOM_HOST')),
      url: derived(cfg => `http://${cfg.tempHost}`),
    };

    const config = load(schema, {
      env: { CUSTOM_HOST: 'example.com' },
    });

    expect(config.url).toBe('http://example.com');
  });

  it('derived fields can combine multiple sources', () => {
    const schema = {
      protocol: string(),
      tempHost: ephemeral(string()),
      tempPort: ephemeral(number()),
      path: string().default('/api'),
      fullUrl: derived(cfg => `${cfg.protocol}://${cfg.tempHost}:${cfg.tempPort}${cfg.path}`),
    };

    const config = load(schema, {
      env: {
        PROTOCOL: 'https',
        TEMP_HOST: 'api.example.com',
        TEMP_PORT: '443',
      },
    });

    expect(config.fullUrl).toBe('https://api.example.com:443/api');
    expect(config.protocol).toBe('https');
    expect(config.path).toBe('/api');
    expect('tempHost' in config).toBe(false);
    expect('tempPort' in config).toBe(false);
  });

  it('derived fields throw clear errors on compute failure', () => {
    const schema = {
      value: string(),
      computed: derived(_cfg => {
        throw new Error('Computation failed');
      }),
    };

    expect(() =>
      load(schema, {
        env: { VALUE: 'test' },
      }),
    ).toThrow("Derived config 'computed' failed to compute. Computation failed");
  });

  it('type inference excludes ephemeral and includes derived', () => {
    const schema = {
      pgHost: ephemeral(string()),
      pgPort: ephemeral(number()),
      apiKey: string(),
      databaseUrl: derived(cfg => `postgresql://${cfg.pgHost}:${cfg.pgPort}/mydb`),
    };

    type Config = InferConfig<typeof schema>;

    const config: Config = load(schema, {
      env: {
        PG_HOST: 'localhost',
        PG_PORT: '5432',
        API_KEY: 'secret',
      },
    });

    expect(config.apiKey).toBe('secret');
    expect(config.databaseUrl).toBe('postgresql://localhost:5432/mydb');
  });

  it('works with .env files', () => {
    const tmpFile = join(tmpdir(), `.env-test-${Date.now()}`);
    writeFileSync(
      tmpFile,
      `PG_HOST=localhost
PG_PORT=5432
PG_USER=admin`,
    );

    try {
      const schema = {
        pgHost: ephemeral(string()),
        pgPort: ephemeral(number()),
        pgUser: ephemeral(string()),
        connectionString: derived(cfg => `${cfg.pgUser}@${cfg.pgHost}:${cfg.pgPort}`),
      };

      const config = load(schema, {
        envFile: tmpFile,
        env: {},
      });

      expect(config.connectionString).toBe('admin@localhost:5432');
    } finally {
      if (existsSync(tmpFile)) unlinkSync(tmpFile);
    }
  });

  it('works with envPrefix', () => {
    const schema = {
      tempHost: ephemeral(string()),
      url: derived(cfg => `http://${cfg.tempHost}`),
    };

    const config = load(schema, {
      env: { APP_TEMP_HOST: 'example.com' },
      envPrefix: 'APP_',
    });

    expect(config.url).toBe('http://example.com');
  });

  it('derived fields can perform transformations', () => {
    const schema = {
      rawValue: ephemeral(string()),
      transformed: derived(cfg => (cfg.rawValue as string).toUpperCase()),
    };

    const config = load(schema, {
      env: { RAW_VALUE: 'hello' },
    });

    expect(config.transformed).toBe('HELLO');
  });

  it('derived fields can return different types', () => {
    const schema = {
      count: ephemeral(number()),
      isPositive: derived(cfg => (cfg.count as number) > 0),
      doubled: derived(cfg => (cfg.count as number) * 2),
      summary: derived(cfg => ({ count: cfg.count as number, doubled: (cfg.count as number) * 2 })),
    };

    const config = load(schema, {
      env: { COUNT: '5' },
    });

    expect(config.isPositive).toBe(true);
    expect(config.doubled).toBe(10);
    expect(config.summary).toEqual({ count: 5, doubled: 10 });
  });

  it('handles complex real-world scenario', () => {
    const schema = {
      dbHost: ephemeral(string().default('localhost')),
      dbPort: ephemeral(number().default(5432)),
      dbName: ephemeral(string()),
      dbUser: ephemeral(string()),
      dbPassword: ephemeral(string()),
      appName: string(),
      port: number().default(3000),
      databaseUrl: derived(
        cfg =>
          `postgresql://${cfg.dbUser}:${cfg.dbPassword}@${cfg.dbHost}:${cfg.dbPort}/${cfg.dbName}`,
      ),
      serverUrl: derived(cfg => `http://localhost:${cfg.port}`),
    };

    const config = load(schema, {
      env: {
        DB_NAME: 'myapp',
        DB_USER: 'admin',
        DB_PASSWORD: 'secret',
        APP_NAME: 'MyApp',
      },
    });

    expect(config.databaseUrl).toBe('postgresql://admin:secret@localhost:5432/myapp');
    expect(config.serverUrl).toBe('http://localhost:3000');
    expect(config.appName).toBe('MyApp');
    expect(config.port).toBe(3000);
    expect('dbHost' in config).toBe(false);
    expect('dbPassword' in config).toBe(false);
  });
});

describe('skipMissing option', () => {
  it('skips missing env var when skipMissing is true', () => {
    const schema = {
      REQUIRED_VAR: string(),
    };

    const config = load(schema, { 
      env: {}, 
      skipMissing: true 
    });

    expect(config.REQUIRED_VAR).toBeUndefined();
  });

  it('still throws when skipMissing is false (default)', () => {
    const schema = {
      REQUIRED_VAR: string(),
    };

    expect(() => load(schema, { env: {} })).toThrow(
      "Config 'REQUIRED_VAR' is missing and has no default."
    );
  });

  it('still throws when skipMissing is explicitly false', () => {
    const schema = {
      REQUIRED_VAR: string(),
    };

    expect(() => load(schema, { env: {}, skipMissing: false })).toThrow(
      "Config 'REQUIRED_VAR' is missing and has no default."
    );
  });
});

